from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage
import aiohttp
from bs4 import BeautifulSoup
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# LLM Configuration
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Initialize scheduler
scheduler = AsyncIOScheduler()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class Tag(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str = "#3b82f6"

class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None

class Source(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: str
    category: Optional[str] = None
    tags: List[str] = []
    active: bool = True
    last_checked: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class Summary(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_id: Optional[str] = None
    source_name: str
    url: str
    title: str
    content: str
    summary: str
    category: Optional[str] = None
    tags: List[str] = []
    is_new: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SourceReference(BaseModel):
    url: str
    title: str
    source_name: str

class Article(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    theme: str
    content: str
    sources: List[str] = []  # Keep for backward compatibility
    source_references: List[SourceReference] = []  # New detailed sources
    tags: List[str] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class SourceCreate(BaseModel):
    name: str
    url: str
    category: Optional[str] = None
    tags: List[str] = []

class SingleUrlRequest(BaseModel):
    url: str
    save: bool = False

class CompileArticleRequest(BaseModel):
    title: str
    theme: str
    summary_ids: List[str]

# ============== HELPER FUNCTIONS ==============

async def extract_content_from_url(url: str) -> dict:
    """Extract content from a URL using web scraping"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status == 200:
                    html = await response.text()
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    # Remove script and style elements
                    for script in soup(["script", "style"]):
                        script.decompose()
                    
                    # Try to get title
                    title = ""
                    if soup.title:
                        title = soup.title.string
                    elif soup.find('h1'):
                        title = soup.find('h1').get_text()
                    
                    # Get text content
                    text = soup.get_text()
                    lines = (line.strip() for line in text.splitlines())
                    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
                    text = '\n'.join(chunk for chunk in chunks if chunk)
                    
                    # Limit content to avoid token limits
                    text = text[:15000]
                    
                    return {
                        "title": title or "No title found",
                        "content": text,
                        "success": True
                    }
                else:
                    return {"title": "", "content": "", "success": False, "error": f"HTTP {response.status}"}
    except Exception as e:
        logger.error(f"Error extracting content from {url}: {str(e)}")
        return {"title": "", "content": "", "success": False, "error": str(e)}

async def generate_summary_with_llm(content: str, title: str) -> str:
    """Generate a summary using LLM"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Tu es un expert en intelligence artificielle qui crée des résumés clairs, concis et instructifs d'articles techniques. Tes résumés doivent être informatifs et pédagogiques."
        ).with_model("openai", "gpt-4o-mini")
        
        user_message = UserMessage(
            text=f"""Voici un article sur l'intelligence artificielle :

Titre : {title}

Contenu :
{content}

Crée un résumé détaillé et pédagogique de cet article en français. Le résumé doit :
1. Expliquer les points clés de manière claire
2. Être informatif et instructif
3. Faire entre 150-300 mots
4. Mettre en avant les nouveautés ou informations importantes

Résumé :"""
        )
        
        response = await chat.send_message(user_message)
        return response
    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        return f"Erreur lors de la génération du résumé: {str(e)}"

async def compile_article_with_llm(theme: str, summaries: List[Summary]) -> str:
    """Compile multiple summaries into an in-depth SEO-optimized article"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=str(uuid.uuid4()),
            system_message="Tu es un expert en rédaction d'articles SEO sur l'intelligence artificielle. Tu crées des contenus approfondis, structurés et optimisés pour le référencement."
        ).with_model("openai", "gpt-4o-mini")
        
        # Extract full content from URLs and prepare sources
        sources_data = []
        for i, s in enumerate(summaries):
            logger.info(f"Extracting full content from {s.url}")
            extracted = await extract_content_from_url(s.url)
            
            source_info = f"""
Source {i+1}: {s.source_name}
URL: {s.url}
Titre: {s.title}
Résumé: {s.summary}
Contenu complet extrait: {extracted['content'][:8000] if extracted['success'] else 'Contenu non disponible'}
"""
            sources_data.append(source_info)
        
        sources_text = "\n\n".join(sources_data)
        
        user_message = UserMessage(
            text=f"""Rédige un article SEO approfondi et détaillé sur le thème "{theme}" en français, en utilisant les sources fournies.

SOURCES COMPLÈTES :
{sources_text}

CONSIGNES STRICTES :
1. **Format Markdown** : Utilise la syntaxe Markdown pour tout le formatage
2. **Structure SEO optimale** :
   - 1 titre H1 (# Titre principal)
   - Plusieurs H2 (## Section) et H3 (### Sous-section)
   - Introduction engageante avec le mot-clé principal
   - Conclusion avec appel à l'action
3. **Longueur** : MINIMUM 1500 mots (c'est crucial pour le SEO)
4. **Contenu approfondi** :
   - Analyse détaillée de chaque source
   - Exemples concrets et cas d'usage
   - Données techniques et chiffres issus des sources
   - Explications pédagogiques et vulgarisation
   - Perspectives et implications
5. **SEO** :
   - Intégration naturelle des mots-clés
   - Paragraphes de 3-5 phrases
   - Listes à puces pour la lisibilité
   - Liens internes logiques entre sections
6. **Ton** : Professionnel, informatif, pédagogique

STRUCTURE SUGGÉRÉE :
# [Titre Principal Accrocheur]

## Introduction
[150-200 mots introduisant le sujet avec le contexte]

## Contexte et Enjeux
[300-400 mots sur le contexte général]

## Analyse Détaillée
[500-600 mots analysant les sources en profondeur]

## Cas d'Usage et Applications
[300-400 mots sur les applications pratiques]

## Perspectives et Avenir
[200-300 mots sur les implications futures]

## Conclusion
[100-150 mots de synthèse]

Génère maintenant l'article complet :"""
        )
        
        response = await chat.send_message(user_message)
        return response
    except Exception as e:
        logger.error(f"Error compiling article: {str(e)}")
        return f"Erreur lors de la compilation: {str(e)}"

# ============== SCHEDULED JOBS ==============

async def check_sources_job():
    """Background job to check all active sources daily"""
    logger.info("Starting daily source check...")
    try:
        sources = await db.sources.find({"active": True}).to_list(length=None)
        logger.info(f"Found {len(sources)} active sources to check")
        
        for source_data in sources:
            try:
                source = Source(**source_data)
                logger.info(f"Checking source: {source.name}")
                
                # Extract content
                extracted = await extract_content_from_url(source.url)
                
                if extracted["success"]:
                    # Generate summary
                    summary_text = await generate_summary_with_llm(
                        extracted["content"],
                        extracted["title"]
                    )
                    
                    # Save summary
                    summary = Summary(
                        source_id=source.id,
                        source_name=source.name,
                        url=source.url,
                        title=extracted["title"],
                        content=extracted["content"][:5000],
                        summary=summary_text,
                        category=source.category,
                        tags=source.tags,
                        is_new=True
                    )
                    
                    await db.summaries.insert_one(summary.dict())
                    logger.info(f"Summary created for {source.name}")
                    
                    # Update last_checked
                    await db.sources.update_one(
                        {"id": source.id},
                        {"$set": {"last_checked": datetime.now(timezone.utc).isoformat()}}
                    )
                else:
                    logger.warning(f"Failed to extract content from {source.name}: {extracted.get('error')}")
                    
            except Exception as e:
                logger.error(f"Error processing source {source_data.get('name')}: {str(e)}")
                
        logger.info("Daily source check completed")
    except Exception as e:
        logger.error(f"Error in check_sources_job: {str(e)}")

# ============== ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "AI Veille API"}

# Sources routes
@api_router.post("/sources", response_model=Source)
async def create_source(source: SourceCreate):
    source_obj = Source(**source.dict())
    await db.sources.insert_one(source_obj.dict())
    return source_obj

@api_router.get("/sources", response_model=List[Source])
async def get_sources():
    sources = await db.sources.find().to_list(length=None)
    return [Source(**source) for source in sources]

@api_router.get("/sources/{source_id}", response_model=Source)
async def get_source(source_id: str):
    source = await db.sources.find_one({"id": source_id})
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return Source(**source)

@api_router.put("/sources/{source_id}", response_model=Source)
async def update_source(source_id: str, source: SourceCreate):
    result = await db.sources.update_one(
        {"id": source_id},
        {"$set": source.dict()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    updated = await db.sources.find_one({"id": source_id})
    return Source(**updated)

@api_router.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    result = await db.sources.delete_one({"id": source_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"message": "Source deleted"}

@api_router.post("/sources/{source_id}/toggle")
async def toggle_source(source_id: str):
    source = await db.sources.find_one({"id": source_id})
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    
    new_active = not source.get("active", True)
    await db.sources.update_one(
        {"id": source_id},
        {"$set": {"active": new_active}}
    )
    return {"active": new_active}

# Summaries routes
@api_router.get("/summaries", response_model=List[Summary])
async def get_summaries(
    category: Optional[str] = None,
    tag: Optional[str] = None,
    is_new: Optional[bool] = None
):
    query = {}
    if category:
        query["category"] = category
    if tag:
        query["tags"] = tag
    if is_new is not None:
        query["is_new"] = is_new
    
    summaries = await db.summaries.find(query).sort("created_at", -1).to_list(length=None)
    return [Summary(**summary) for summary in summaries]

@api_router.get("/summaries/{summary_id}", response_model=Summary)
async def get_summary(summary_id: str):
    summary = await db.summaries.find_one({"id": summary_id})
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    return Summary(**summary)

@api_router.post("/summaries/{summary_id}/mark-read")
async def mark_summary_read(summary_id: str):
    result = await db.summaries.update_one(
        {"id": summary_id},
        {"$set": {"is_new": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Summary not found")
    return {"message": "Marked as read"}

@api_router.delete("/summaries/{summary_id}")
async def delete_summary(summary_id: str):
    result = await db.summaries.delete_one({"id": summary_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Summary not found")
    return {"message": "Summary deleted"}

# Single URL processing
@api_router.post("/process-url")
async def process_single_url(request: SingleUrlRequest):
    # Extract content
    extracted = await extract_content_from_url(request.url)
    
    if not extracted["success"]:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to extract content: {extracted.get('error', 'Unknown error')}"
        )
    
    # Generate summary
    summary_text = await generate_summary_with_llm(
        extracted["content"],
        extracted["title"]
    )
    
    # Create summary object
    summary = Summary(
        source_name="Single URL",
        url=request.url,
        title=extracted["title"],
        content=extracted["content"][:5000],
        summary=summary_text,
        is_new=False
    )
    
    # Save if requested
    if request.save:
        await db.summaries.insert_one(summary.dict())
    
    return summary

# Articles routes
@api_router.post("/articles", response_model=Article)
async def create_article(request: CompileArticleRequest):
    # Get summaries
    summaries_data = await db.summaries.find(
        {"id": {"$in": request.summary_ids}}
    ).to_list(length=None)
    
    if not summaries_data:
        raise HTTPException(status_code=404, detail="No summaries found")
    
    summaries = [Summary(**s) for s in summaries_data]
    
    # Compile article
    content = await compile_article_with_llm(request.theme, summaries)
    
    # Extract all tags from summaries
    all_tags = list(set(tag for s in summaries for tag in s.tags))
    
    # Create source references with detailed info
    source_refs = [
        SourceReference(
            url=s.url,
            title=s.title,
            source_name=s.source_name
        ) for s in summaries
    ]
    
    # Create article
    article = Article(
        title=request.title,
        theme=request.theme,
        content=content,
        sources=[s.url for s in summaries],  # Keep for backward compatibility
        source_references=source_refs,
        tags=all_tags
    )
    
    await db.articles.insert_one(article.dict())
    return article

@api_router.get("/articles", response_model=List[Article])
async def get_articles():
    articles = await db.articles.find().sort("created_at", -1).to_list(length=None)
    return [Article(**article) for article in articles]

@api_router.get("/articles/{article_id}", response_model=Article)
async def get_article(article_id: str):
    article = await db.articles.find_one({"id": article_id})
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return Article(**article)

@api_router.delete("/articles/{article_id}")
async def delete_article(article_id: str):
    result = await db.articles.delete_one({"id": article_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article not found")
    return {"message": "Article deleted"}

# Tags routes
@api_router.get("/tags")
async def get_tags():
    # Get unique tags from summaries
    summaries = await db.summaries.find().to_list(length=None)
    tags_set = set()
    for summary in summaries:
        tags_set.update(summary.get("tags", []))
    return list(tags_set)

# Categories routes
@api_router.get("/categories")
async def get_categories():
    # Get unique categories from sources and summaries
    sources = await db.sources.find().to_list(length=None)
    summaries = await db.summaries.find().to_list(length=None)
    
    categories_set = set()
    for source in sources:
        if source.get("category"):
            categories_set.add(source["category"])
    for summary in summaries:
        if summary.get("category"):
            categories_set.add(summary["category"])
    
    return list(categories_set)

# Stats route
@api_router.get("/stats")
async def get_stats():
    total_sources = await db.sources.count_documents({})
    active_sources = await db.sources.count_documents({"active": True})
    total_summaries = await db.summaries.count_documents({})
    new_summaries = await db.summaries.count_documents({"is_new": True})
    total_articles = await db.articles.count_documents({})
    
    return {
        "total_sources": total_sources,
        "active_sources": active_sources,
        "total_summaries": total_summaries,
        "new_summaries": new_summaries,
        "total_articles": total_articles
    }

# Manual trigger for source checking
@api_router.post("/check-sources")
async def trigger_source_check(background_tasks: BackgroundTasks):
    background_tasks.add_task(check_sources_job)
    return {"message": "Source check started in background"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting scheduler...")
    # Schedule daily check at 9:00 AM
    scheduler.add_job(
        check_sources_job,
        'cron',
        hour=9,
        minute=0,
        id='daily_source_check'
    )
    scheduler.start()
    logger.info("Scheduler started")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
