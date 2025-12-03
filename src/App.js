import React from 'react';
import ImageAnalyzer from './components/ImageAnalyzer';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>📷 Analizador de Imágenes RGB</h1>
          <p>Dibuja una línea sobre una imagen para analizar el perfil de colores</p>
          <div className="developer-badge">
            <span>by </span>
            <a href="https://oscar-pab-github-io.vercel.app/" target="_blank" rel="noopener noreferrer">
              OscarDev
            </a>
          </div>
        </div>
      </header>
      <main>
        <ImageAnalyzer />
      </main>
      <footer>
        <div className="footer-content">
          <p>© {new Date().getFullYear()} OscarDev - Todos los derechos reservados</p>
          <p>
            Herramienta para análisis de espectros de luz | 
            <a href="https://oscar-pab-github-io.vercel.app/" target="_blank" rel="noopener noreferrer">
              Visita mi portafolio
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;