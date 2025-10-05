import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Dashboard Component
const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [recentSummaries, setRecentSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, summariesRes] = await Promise.all([
        axios.get(`${API}/stats`),
        axios.get(`${API}/summaries?limit=6`)
      ]);
      setStats(statsRes.data);
      setRecentSummaries(summariesRes.data.slice(0, 6));
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Chargement...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 data-testid="dashboard-title">Tableau de bord</h1>
        <p>Vue d'ensemble de votre veille IA</p>
      </div>

      <div className="stats-grid">
        <Card className="stat-card" data-testid="stat-sources">
          <CardHeader>
            <CardTitle>{stats?.total_sources || 0}</CardTitle>
            <CardDescription>Sources totales</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="stat-detail">{stats?.active_sources || 0} actives</p>
          </CardContent>
        </Card>

        <Card className="stat-card" data-testid="stat-summaries">
          <CardHeader>
            <CardTitle>{stats?.total_summaries || 0}</CardTitle>
            <CardDescription>Résumés générés</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="stat-detail">{stats?.new_summaries || 0} nouveaux</p>
          </CardContent>
        </Card>

        <Card className="stat-card" data-testid="stat-articles">
          <CardHeader>
            <CardTitle>{stats?.total_articles || 0}</CardTitle>
            <CardDescription>Articles compilés</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="recent-section">
        <div className="section-header">
          <h2>Résumés récents</h2>
          <Button variant="outline" onClick={() => navigate('/summaries')} data-testid="view-all-summaries-btn">
            Voir tout
          </Button>
        </div>
        <div className="summaries-grid">
          {recentSummaries.map((summary) => (
            <Card key={summary.id} className="summary-card" data-testid={`summary-card-${summary.id}`}>
              <CardHeader>
                <div className="summary-card-header">
                  <CardTitle className="summary-title">{summary.title}</CardTitle>
                  {summary.is_new && <Badge variant="default" data-testid="new-badge">Nouveau</Badge>}
                </div>
                <CardDescription>{summary.source_name}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="summary-preview">{summary.summary.substring(0, 150)}...</p>
                {summary.tags && summary.tags.length > 0 && (
                  <div className="tags-container">
                    {summary.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button variant="link" onClick={() => navigate(`/summaries/${summary.id}`)} data-testid={`view-summary-btn-${summary.id}`}>
                  Lire plus →
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

// Sources Management Component
const Sources = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    category: "",
    tags: ""
  });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const response = await axios.get(`${API}/sources`);
      setSources(response.data);
    } catch (error) {
      console.error("Error fetching sources:", error);
      toast.error("Erreur lors du chargement des sources");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        url: formData.url,
        category: formData.category || null,
        tags: formData.tags ? formData.tags.split(",").map(t => t.trim()) : []
      };

      if (editingSource) {
        await axios.put(`${API}/sources/${editingSource.id}`, payload);
        toast.success("Source mise à jour");
      } else {
        await axios.post(`${API}/sources`, payload);
        toast.success("Source ajoutée");
      }

      setDialogOpen(false);
      setFormData({ name: "", url: "", category: "", tags: "" });
      setEditingSource(null);
      fetchSources();
    } catch (error) {
      console.error("Error saving source:", error);
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      category: source.category || "",
      tags: source.tags.join(", ")
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette source ?")) return;
    try {
      await axios.delete(`${API}/sources/${id}`);
      toast.success("Source supprimée");
      fetchSources();
    } catch (error) {
      console.error("Error deleting source:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleToggle = async (id) => {
    try {
      await axios.post(`${API}/sources/${id}/toggle`);
      toast.success("Statut mis à jour");
      fetchSources();
    } catch (error) {
      console.error("Error toggling source:", error);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  if (loading) {
    return <div className="loading-container">Chargement...</div>;
  }

  return (
    <div className="sources-container">
      <div className="sources-header">
        <div>
          <h1 data-testid="sources-title">Gestion des sources</h1>
          <p>Gérez vos sources de veille IA</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingSource(null);
              setFormData({ name: "", url: "", category: "", tags: "" });
            }} data-testid="add-source-btn">
              + Ajouter une source
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="source-dialog">
            <DialogHeader>
              <DialogTitle>{editingSource ? "Modifier la source" : "Nouvelle source"}</DialogTitle>
              <DialogDescription>
                Ajoutez une URL qualifiée pour votre veille IA
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <Label htmlFor="name">Nom de la source</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    data-testid="source-name-input"
                  />
                </div>
                <div className="form-field">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    required
                    data-testid="source-url-input"
                  />
                </div>
                <div className="form-field">
                  <Label htmlFor="category">Catégorie (optionnel)</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Ex: LLMs, Vision, Éthique"
                    data-testid="source-category-input"
                  />
                </div>
                <div className="form-field">
                  <Label htmlFor="tags">Tags (séparés par des virgules)</Label>
                  <Input
                    id="tags"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="Ex: GPT, Anthropic, Open Source"
                    data-testid="source-tags-input"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" data-testid="save-source-btn">
                  {editingSource ? "Mettre à jour" : "Ajouter"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="sources-list">
        {sources.length === 0 ? (
          <Card className="empty-state">
            <CardContent>
              <p>Aucune source ajoutée. Commencez par ajouter votre première source !</p>
            </CardContent>
          </Card>
        ) : (
          sources.map((source) => (
            <Card key={source.id} className="source-card" data-testid={`source-card-${source.id}`}>
              <CardHeader>
                <div className="source-card-header">
                  <div>
                    <CardTitle>{source.name}</CardTitle>
                    <CardDescription className="source-url">{source.url}</CardDescription>
                  </div>
                  <div className="source-actions">
                    <Switch
                      checked={source.active}
                      onCheckedChange={() => handleToggle(source.id)}
                      data-testid={`toggle-source-${source.id}`}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {source.category && (
                  <Badge variant="outline" className="category-badge">{source.category}</Badge>
                )}
                {source.tags && source.tags.length > 0 && (
                  <div className="tags-container">
                    {source.tags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
                {source.last_checked && (
                  <p className="last-checked">Dernière vérification: {new Date(source.last_checked).toLocaleDateString('fr-FR')}</p>
                )}
              </CardContent>
              <CardFooter className="source-footer">
                <Button variant="outline" size="sm" onClick={() => handleEdit(source)} data-testid={`edit-source-${source.id}`}>
                  Modifier
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(source.id)} data-testid={`delete-source-${source.id}`}>
                  Supprimer
                </Button>
              </CardFooter>
            </Card>
          );
          })
        )}
      </div>
    </div>
  );
};

// Summaries Component
const Summaries = () => {
  const [summaries, setSummaries] = useState([]);
  const [filteredSummaries, setFilteredSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [view, setView] = useState("chronological");
  const [selectedForArticle, setSelectedForArticle] = useState([]);
  const [compilingArticle, setCompilingArticle] = useState(false);
  const [showCompileDialog, setShowCompileDialog] = useState(false);
  const [articleFormData, setArticleFormData] = useState({ title: "", theme: "" });
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterSummaries();
  }, [summaries, selectedCategory, selectedTag, view]);

  const fetchData = async () => {
    try {
      const [summariesRes, categoriesRes, tagsRes] = await Promise.all([
        axios.get(`${API}/summaries`),
        axios.get(`${API}/categories`),
        axios.get(`${API}/tags`)
      ]);
      setSummaries(summariesRes.data);
      setCategories(categoriesRes.data);
      setTags(tagsRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const filterSummaries = () => {
    let filtered = [...summaries];

    if (selectedCategory !== "all") {
      filtered = filtered.filter(s => s.category === selectedCategory);
    }

    if (selectedTag !== "all") {
      filtered = filtered.filter(s => s.tags && s.tags.includes(selectedTag));
    }

    if (view === "category") {
      filtered.sort((a, b) => {
        if (a.category === b.category) {
          return new Date(b.created_at) - new Date(a.created_at);
        }
        return (a.category || "").localeCompare(b.category || "");
      });
    } else {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    setFilteredSummaries(filtered);
  };

  const toggleSummarySelection = (id) => {
    setSelectedForArticle(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleCompileArticle = async (e) => {
    e.preventDefault();
    if (selectedForArticle.length < 2) {
      toast.error("Veuillez sélectionner au moins 2 résumés pour compiler un article");
      return;
    }

    setCompilingArticle(true);
    try {
      const response = await axios.post(`${API}/articles`, {
        title: articleFormData.title,
        theme: articleFormData.theme,
        summary_ids: selectedForArticle
      });
      
      toast.success("Article compilé avec succès !");
      setShowCompileDialog(false);
      setArticleFormData({ title: "", theme: "" });
      setSelectedForArticle([]);
      navigate(`/articles/${response.data.id}`);
    } catch (error) {
      console.error("Error compiling article:", error);
      toast.error("Erreur lors de la compilation de l'article");
    } finally {
      setCompilingArticle(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Chargement...</div>;
  }

  return (
    <div className="summaries-container">
      <div className="summaries-header">
        <div>
          <h1 data-testid="summaries-title">Résumés</h1>
          <p>Tous vos résumés de veille IA</p>
        </div>
        {selectedForArticle.length > 0 && (
          <div className="selection-actions">
            <span className="selection-count">{selectedForArticle.length} résumé(s) sélectionné(s)</span>
            <Button 
              onClick={() => setShowCompileDialog(true)}
              data-testid="open-compile-dialog-btn"
            >
              Compiler en article
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setSelectedForArticle([])}
              data-testid="clear-selection-btn"
            >
              Annuler la sélection
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showCompileDialog} onOpenChange={setShowCompileDialog}>
        <DialogContent data-testid="compile-article-dialog">
          <DialogHeader>
            <DialogTitle>Compiler un article</DialogTitle>
            <DialogDescription>
              Créez un article instructif à partir de {selectedForArticle.length} résumé(s) sélectionné(s)
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCompileArticle}>
            <div className="form-grid">
              <div className="form-field">
                <Label htmlFor="article-title">Titre de l'article</Label>
                <Input
                  id="article-title"
                  value={articleFormData.title}
                  onChange={(e) => setArticleFormData({ ...articleFormData, title: e.target.value })}
                  required
                  placeholder="Ex: Les avancées de l'IA en 2025"
                  data-testid="compile-article-title-input"
                />
              </div>
              <div className="form-field">
                <Label htmlFor="article-theme">Thème de l'article</Label>
                <Textarea
                  id="article-theme"
                  value={articleFormData.theme}
                  onChange={(e) => setArticleFormData({ ...articleFormData, theme: e.target.value })}
                  required
                  placeholder="Ex: Évolution des modèles de langage et leur impact"
                  data-testid="compile-article-theme-input"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="submit" 
                disabled={compilingArticle}
                data-testid="submit-compile-btn"
              >
                {compilingArticle ? "Génération en cours..." : "Générer l'article"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="filters-section">
        <Tabs value={view} onValueChange={setView}>
          <TabsList data-testid="view-tabs">
            <TabsTrigger value="chronological" data-testid="chronological-tab">Chronologique</TabsTrigger>
            <TabsTrigger value="category" data-testid="category-tab">Par catégorie</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="filters">
          <div className="filter-group">
            <Label>Catégorie</Label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="filter-select"
              data-testid="category-filter"
            >
              <option value="all">Toutes</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <Label>Tag</Label>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="filter-select"
              data-testid="tag-filter"
            >
              <option value="all">Tous</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="summaries-grid">
        {filteredSummaries.length === 0 ? (
          <Card className="empty-state">
            <CardContent>
              <p>Aucun résumé disponible</p>
            </CardContent>
          </Card>
        ) : (
          filteredSummaries.map((summary) => {
            const isAutomatic = summary.source_id !== null && summary.source_id !== undefined;
            return (
            <Card 
              key={summary.id} 
              className={`summary-card ${selectedForArticle.includes(summary.id) ? 'selected' : ''} ${isAutomatic ? 'automatic' : 'manual'}`}
              data-testid={`summary-card-${summary.id}`}
            >
              <CardHeader>
                <div className="summary-card-header">
                  <div className="summary-header-left">
                    <input
                      type="checkbox"
                      checked={selectedForArticle.includes(summary.id)}
                      onChange={() => toggleSummarySelection(summary.id)}
                      className="summary-checkbox"
                      data-testid={`select-summary-checkbox-${summary.id}`}
                    />
                    <CardTitle className="summary-title">{summary.title}</CardTitle>
                  </div>
                  <div className="badges-group">
                    {summary.is_new && <Badge variant="default" data-testid="new-badge">Nouveau</Badge>}
                    {isAutomatic && (
                      <Badge variant="secondary" className="auto-badge" data-testid="auto-badge">
                        🤖 Veille auto
                      </Badge>
                    )}
                    {!isAutomatic && (
                      <Badge variant="outline" className="manual-badge" data-testid="manual-badge">
                        ✋ Manuel
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription>{summary.source_name}</CardDescription>
                {summary.category && (
                  <Badge variant="outline" className="category-badge">{summary.category}</Badge>
                )}
              </CardHeader>
              <CardContent>
                <p className="summary-preview">{summary.summary.substring(0, 200)}...</p>
                {summary.tags && summary.tags.length > 0 && (
                  <div className="tags-container">
                    {summary.tags.slice(0, 4).map((tag, idx) => (
                      <Badge key={idx} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
                <p className="summary-date">{new Date(summary.created_at).toLocaleDateString('fr-FR')}</p>
              </CardContent>
              <CardFooter>
                <Button onClick={() => navigate(`/summaries/${summary.id}`)} data-testid={`view-summary-btn-${summary.id}`}>
                  Lire le résumé complet
                </Button>
              </CardFooter>
            </Card>
          );
          })
        )}
      </div>
    </div>
  );
};

// Summary Detail Component
const SummaryDetail = () => {
  const { id } = useParams();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSummary();
  }, [id]);

  const fetchSummary = async () => {
    try {
      const response = await axios.get(`${API}/summaries/${id}`);
      setSummary(response.data);
      if (response.data.is_new) {
        await axios.post(`${API}/summaries/${id}/mark-read`);
      }
    } catch (error) {
      console.error("Error fetching summary:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Chargement...</div>;
  }

  if (!summary) {
    return <div className="error-container">Résumé non trouvé</div>;
  }

  return (
    <div className="summary-detail-container">
      <Button variant="outline" onClick={() => navigate('/summaries')} className="back-button" data-testid="back-btn">
        ← Retour
      </Button>

      <Card className="detail-card">
        <CardHeader>
          <div className="detail-header">
            <div>
              <CardTitle className="detail-title" data-testid="summary-detail-title">{summary.title}</CardTitle>
              <CardDescription>{summary.source_name}</CardDescription>
            </div>
            {summary.category && (
              <Badge variant="outline" className="category-badge">{summary.category}</Badge>
            )}
          </div>
          <div className="detail-meta">
            <a href={summary.url} target="_blank" rel="noopener noreferrer" className="source-link" data-testid="source-link">
              Voir la source →
            </a>
            <p className="summary-date">{new Date(summary.created_at).toLocaleDateString('fr-FR', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</p>
          </div>
        </CardHeader>
        <CardContent>
          {summary.tags && summary.tags.length > 0 && (
            <div className="tags-container detail-tags">
              {summary.tags.map((tag, idx) => (
                <Badge key={idx} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
          <Separator className="my-6" />
          <div className="summary-content" data-testid="summary-content">
            <h3>Résumé</h3>
            <p className="summary-text">{summary.summary}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Single URL Component
const SingleUrl = () => {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveOption, setSaveOption] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await axios.post(`${API}/process-url`, {
        url: url,
        save: saveOption
      });
      setResult(response.data);
      toast.success("Résumé généré avec succès");
    } catch (error) {
      console.error("Error processing URL:", error);
      toast.error("Erreur lors du traitement de l'URL");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="single-url-container">
      <div className="single-url-header">
        <h1 data-testid="single-url-title">Résumé d'URL unique</h1>
        <p>Obtenez un résumé instantané d'un article</p>
      </div>

      <Card className="url-form-card">
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <Label htmlFor="url">URL de l'article</Label>
              <Input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required
                data-testid="url-input"
              />
            </div>
            <div className="form-field checkbox-field">
              <div className="checkbox-wrapper">
                <Switch
                  id="save"
                  checked={saveOption}
                  onCheckedChange={setSaveOption}
                  data-testid="save-switch"
                />
                <Label htmlFor="save">Sauvegarder le résumé</Label>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="submit-button" data-testid="generate-summary-btn">
              {loading ? "Génération en cours..." : "Générer le résumé"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className="result-card">
          <CardHeader>
            <CardTitle data-testid="result-title">{result.title}</CardTitle>
            <CardDescription>
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="source-link" data-testid="result-source-link">
                Voir la source →
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="summary-content" data-testid="result-summary">
              <h3>Résumé</h3>
              <p className="summary-text">{result.summary}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Articles Component
const Articles = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const articlesRes = await axios.get(`${API}/articles`);
      setArticles(articlesRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Chargement...</div>;
  }

  return (
    <div className="articles-container">
      <div className="articles-header">
        <div>
          <h1 data-testid="articles-title">Articles compilés</h1>
          <p>Articles instructifs générés à partir de résumés validés</p>
          <p className="info-text">💡 Pour créer un article, sélectionnez des résumés dans la page "Résumés"</p>
        </div>
      </div>

      <div className="articles-list">
        {articles.length === 0 ? (
          <Card className="empty-state">
            <CardContent>
              <p>Aucun article compilé. Commencez par compiler vos premiers résumés !</p>
            </CardContent>
          </Card>
        ) : (
          articles.map((article) => (
            <Card key={article.id} className="article-card" data-testid={`article-card-${article.id}`}>
              <CardHeader>
                <CardTitle className="article-title" data-testid={`article-title-${article.id}`}>{article.title}</CardTitle>
                <CardDescription>Thème: {article.theme}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="article-preview">{article.content.substring(0, 300)}...</p>
                {article.tags && article.tags.length > 0 && (
                  <div className="tags-container">
                    {article.tags.slice(0, 5).map((tag, idx) => (
                      <Badge key={idx} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
                <p className="article-meta">
                  {article.sources.length} sources • {new Date(article.created_at).toLocaleDateString('fr-FR')}
                </p>
              </CardContent>
              <CardFooter>
                <Button onClick={() => navigate(`/articles/${article.id}`)} data-testid={`view-article-btn-${article.id}`}>
                  Lire l'article complet
                </Button>
              </CardFooter>
            </Card>
          );
          })
        )}
      </div>
    </div>
  );
};

// Article Detail Component
const ArticleDetail = () => {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchArticle();
  }, [id]);

  const fetchArticle = async () => {
    try {
      const response = await axios.get(`${API}/articles/${id}`);
      setArticle(response.data);
    } catch (error) {
      console.error("Error fetching article:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading-container">Chargement...</div>;
  }

  if (!article) {
    return <div className="error-container">Article non trouvé</div>;
  }

  return (
    <div className="article-detail-container">
      <Button variant="outline" onClick={() => navigate('/articles')} className="back-button" data-testid="back-btn">
        ← Retour
      </Button>

      <Card className="detail-card article-detail-card">
        <CardHeader>
          <div className="detail-header">
            <CardTitle className="detail-title" data-testid="article-detail-title">{article.title}</CardTitle>
          </div>
          <CardDescription>Thème: {article.theme}</CardDescription>
          <p className="article-meta">
            {article.sources.length} sources • {new Date(article.created_at).toLocaleDateString('fr-FR', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </CardHeader>
        <CardContent>
          {article.tags && article.tags.length > 0 && (
            <div className="tags-container detail-tags">
              {article.tags.map((tag, idx) => (
                <Badge key={idx} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
          <Separator className="my-6" />
          <div className="article-content" data-testid="article-content">
            <p className="article-text">{article.content}</p>
          </div>
          <Separator className="my-6" />
          <div className="article-sources">
            <h3>Sources</h3>
            <ul>
              {article.sources.map((source, idx) => (
                <li key={idx}>
                  <a href={source} target="_blank" rel="noopener noreferrer" data-testid={`source-link-${idx}`}>
                    {source}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Navigation Component
const Navigation = () => {
  return (
    <nav className="main-nav">
      <div className="nav-container">
        <Link to="/" className="nav-logo" data-testid="nav-logo">
          <span className="logo-icon">🤖</span>
          <span className="logo-text">AI Veille</span>
        </Link>
        <div className="nav-links">
          <Link to="/" className="nav-link" data-testid="nav-dashboard">
            Tableau de bord
          </Link>
          <Link to="/sources" className="nav-link" data-testid="nav-sources">
            Sources
          </Link>
          <Link to="/summaries" className="nav-link" data-testid="nav-summaries">
            Résumés
          </Link>
          <Link to="/single-url" className="nav-link" data-testid="nav-single-url">
            URL unique
          </Link>
          <Link to="/articles" className="nav-link" data-testid="nav-articles">
            Articles
          </Link>
        </div>
      </div>
    </nav>
  );
};

// Main App Component
function App() {
  return (
    <div className="App">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/summaries" element={<Summaries />} />
            <Route path="/summaries/:id" element={<SummaryDetail />} />
            <Route path="/single-url" element={<SingleUrl />} />
            <Route path="/articles" element={<Articles />} />
            <Route path="/articles/:id" element={<ArticleDetail />} />
          </Routes>
        </main>
      </BrowserRouter>
    </div>
  );
}

export default App;
