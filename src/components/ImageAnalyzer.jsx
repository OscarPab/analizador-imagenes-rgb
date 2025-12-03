import React, { useState, useRef, useEffect } from 'react';
import { saveAs } from 'file-saver';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Label
} from 'recharts';
import './ImageAnalyzer.css';

const ImageAnalyzer = () => {
  const [image, setImage] = useState(null);
  const [linePoints, setLinePoints] = useState({ start: null, end: null });
  const [profileData, setProfileData] = useState(null);
  const [thicknessData, setThicknessData] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [smoothing, setSmoothing] = useState(15);
  const [activeGraph, setActiveGraph] = useState('rgb');
  const [isLoading, setIsLoading] = useState(false);
  
  // Parámetros físicos exactos como en Python
  const [params, setParams] = useState({
    n: 1.33,
    lambdaR: 650,
    lambdaG: 550,
    lambdaB: 450,
    pixelSize: 3.09e-5,
    angle: 70,
    length: 380
  });
  
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [scale, setScale] = useState(1);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setLinePoints({ start: null, end: null });
        setProfileData(null);
        setThicknessData(null);
        setIsDrawing(false);
        setIsLoading(false);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const drawCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas || !image) return;

      const ctx = canvas.getContext('2d');
      
      // Calcular tamaño responsivo
      const containerWidth = canvas.parentElement.clientWidth - 40;
      const maxHeight = 400;
      
      const widthRatio = containerWidth / image.width;
      const heightRatio = maxHeight / image.height;
      const ratio = Math.min(widthRatio, heightRatio, 1);
      
      const displayWidth = Math.min(image.width * ratio, containerWidth);
      const displayHeight = image.height * ratio;
      
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      setScale(ratio);
      
      // Limpiar y dibujar imagen
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, displayWidth, displayHeight);
      
      // Dibujar línea si existe
      if (linePoints.start) {
        const startX = linePoints.start.x * ratio;
        const startY = linePoints.start.y * ratio;
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        
        if (linePoints.end) {
          const endX = linePoints.end.x * ratio;
          const endY = linePoints.end.y * ratio;
          ctx.lineTo(endX, endY);
          
          // Punto final
          ctx.beginPath();
          ctx.arc(endX, endY, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#FF0000';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Punto inicial
        ctx.beginPath();
        ctx.arc(startX, startY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#00FF00';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    
    drawCanvas();
  }, [image, linePoints]);

  const handleCanvasClick = (e) => {
    if (!image || isLoading) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (!isDrawing) {
      setLinePoints({ start: { x, y }, end: null });
      setIsDrawing(true);
    } else {
      const newPoints = { start: linePoints.start, end: { x, y } };
      setLinePoints(newPoints);
      setIsDrawing(false);
      extractProfile(newPoints);
    }
  };

  const extractProfile = (points) => {
    if (!image || !points.start || !points.end) return;

    setIsLoading(true);
    
    // Crear canvas temporal para análisis
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    tempCtx.drawImage(image, 0, 0);

    const dx = points.end.x - points.start.x;
    const dy = points.end.y - points.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const numPoints = Math.max(Math.floor(length), 2);
    
    const profile = {
      positions: [],
      red: [],
      green: [],
      blue: []
    };

    // Extraer píxeles a lo largo de la línea (como en Python)
    for (let i = 0; i < numPoints; i++) {
      const t = i / Math.max(numPoints - 1, 1);
      const x = Math.round(points.start.x + dx * t);
      const y = Math.round(points.start.y + dy * t);
      
      if (x >= 0 && x < image.width && y >= 0 && y < image.height) {
        const pixel = tempCtx.getImageData(x, y, 1, 1).data;
        profile.positions.push(i);
        profile.red.push(pixel[0]);
        profile.green.push(pixel[1]);
        profile.blue.push(pixel[2]);
      }
    }

    // Suavizado Savitzky-Golay simplificado (como en Python)
    const savgolFilter = (data, windowSize, polyOrder) => {
      if (data.length < windowSize) return data;
      
      const halfWindow = Math.floor(windowSize / 2);
      const smoothed = [...data];
      
      // Coeficientes para ventana 15, polinomio 3
      const coeffs = [-0.0099, 0.0294, 0.0659, 0.1049, 0.1409, 0.1684, 
                      0.1832, 0.1832, 0.1684, 0.1409, 0.1049, 0.0659, 0.0294, -0.0099];
      
      for (let i = halfWindow; i < data.length - halfWindow; i++) {
        let sum = 0;
        for (let j = -halfWindow; j <= halfWindow; j++) {
          const idx = Math.max(0, Math.min(data.length - 1, i + j));
          const coeff = coeffs[j + halfWindow] || (1/windowSize);
          sum += data[idx] * coeff;
        }
        smoothed[i] = Math.max(0, Math.min(255, Math.round(sum)));
      }
      
      return smoothed;
    };

    const smoothedProfile = {
      positions: profile.positions,
      red: savgolFilter(profile.red, 15, 3),
      green: savgolFilter(profile.green, 15, 3),
      blue: savgolFilter(profile.blue, 15, 3)
    };

    setProfileData(smoothedProfile);
    calculateThickness(smoothedProfile);
    setIsLoading(false);
  };

  const calculateThickness = (profile) => {
    // Encontrar mínimos locales (como find_peaks en Python)
    const findMinima = (data, distance = 10) => {
      const minima = [];
      for (let i = distance; i < data.length - distance; i++) {
        let isMinimum = true;
        
        // Verificar que sea un mínimo local
        for (let j = 1; j <= distance; j++) {
          if (data[i] >= data[i - j] || data[i] >= data[i + j]) {
            isMinimum = false;
            break;
          }
        }
        
        if (isMinimum) {
          minima.push(i);
        }
      }
      return minima;
    };
    
    const minR = findMinima(profile.red, 10);
    const minG = findMinima(profile.green, 10);
    const minB = findMinima(profile.blue, 10);
    
    // Calcular espesor EXACTO como en Python: e = m * λ / (2 * n)
    const calculateThicknessForColor = (minima, lambda) => {
      return minima.map((position, index) => ({
        position: position,
        thickness: (index * lambda) / (2 * params.n),
        order: index
      }));
    };
    
    const thicknessR = calculateThicknessForColor(minR, params.lambdaR);
    const thicknessG = calculateThicknessForColor(minG, params.lambdaG);
    const thicknessB = calculateThicknessForColor(minB, params.lambdaB);
    
    // Convertir posición a metros (como en Python)
    const positionToMeters = (position) => position * params.pixelSize;
    
    const thicknessDataFormatted = {
      red: thicknessR.map(item => ({
        positionM: positionToMeters(item.position),
        thickness: item.thickness,
        order: item.order,
        positionPx: item.position
      })),
      green: thicknessG.map(item => ({
        positionM: positionToMeters(item.position),
        thickness: item.thickness,
        order: item.order,
        positionPx: item.position
      })),
      blue: thicknessB.map(item => ({
        positionM: positionToMeters(item.position),
        thickness: item.thickness,
        order: item.order,
        positionPx: item.position
      }))
    };
    
    setThicknessData(thicknessDataFormatted);
  };

  const handleReset = () => {
    setLinePoints({ start: null, end: null });
    setProfileData(null);
    setThicknessData(null);
    setIsDrawing(false);
  };

  const exportData = () => {
    if (!profileData) return;
    
    let csvContent = "Posicion_px,Rojo,Verde,Azul\n";
    profileData.positions.forEach((pos, index) => {
      csvContent += `${pos},${profileData.red[index]},${profileData.green[index]},${profileData.blue[index]}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `perfil_rgb_${Date.now()}.csv`);
  };

  const exportThicknessData = () => {
    if (!thicknessData) return;
    
    let csvContent = "Color,Posicion_px,Posicion_m,Espesor_nm,Orden\n";
    
    thicknessData.red.forEach(item => {
      csvContent += `Rojo,${item.positionPx},${item.positionM.toExponential(4)},${item.thickness.toFixed(2)},${item.order}\n`;
    });
    
    thicknessData.green.forEach(item => {
      csvContent += `Verde,${item.positionPx},${item.positionM.toExponential(4)},${item.thickness.toFixed(2)},${item.order}\n`;
    });
    
    thicknessData.blue.forEach(item => {
      csvContent += `Azul,${item.positionPx},${item.positionM.toExponential(4)},${item.thickness.toFixed(2)},${item.order}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `espesor_${Date.now()}.csv`);
  };

  const calculateLineLength = () => {
    if (!linePoints.start || !linePoints.end) return 0;
    const dx = linePoints.end.x - linePoints.start.x;
    const dy = linePoints.end.y - linePoints.start.y;
    return Math.sqrt(dx * dx + dy * dy).toFixed(1);
  };

  // Datos para gráfica RGB
  const rgbChartData = profileData ? profileData.positions.map((pos, idx) => ({
    position: pos,
    Rojo: profileData.red[idx],
    Verde: profileData.green[idx],
    Azul: profileData.blue[idx]
  })) : [];

  // Datos para gráfica de espesor (combinados para línea continua)
  const thicknessChartData = thicknessData ? [
    ...thicknessData.red.map(item => ({ 
      position: item.positionM, 
      Rojo: item.thickness,
      order: item.order 
    })),
    ...thicknessData.green.map(item => ({ 
      position: item.positionM, 
      Verde: item.thickness,
      order: item.order 
    })),
    ...thicknessData.blue.map(item => ({ 
      position: item.positionM, 
      Azul: item.thickness,
      order: item.order 
    }))
  ].sort((a, b) => a.position - b.position) : [];

  const handleParamChange = (param, value) => {
    const newValue = parseFloat(value);
    if (isNaN(newValue)) return;
    
    setParams(prev => ({
      ...prev,
      [param]: newValue
    }));
  };

  return (
    <div className="image-analyzer">
      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>Procesando imagen...</p>
        </div>
      )}

      <div className="controls-container">
        <div className="upload-section">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            ref={fileInputRef}
            id="imageUpload"
            style={{ display: 'none' }}
          />
          <label htmlFor="imageUpload" className="upload-btn">
            📁 Subir Imagen
          </label>
          {image && (
            <div className="image-info">
              <span>{image.width} × {image.height} px</span>
            </div>
          )}
        </div>

        <div className="controls-content">
          <div className="left-controls">
            <div className="smoothing-control">
              <label>Suavizado (Savitzky-Golay):</label>
              <div className="slider-container">
                <input
                  type="range"
                  min="5"
                  max="31"
                  step="2"
                  value={smoothing}
                  onChange={(e) => {
                    const newValue = parseInt(e.target.value);
                    setSmoothing(newValue);
                  }}
                  disabled={!profileData}
                />
                <span className="slider-value">{smoothing}</span>
              </div>
            </div>

            <div className="action-buttons">
              <button 
                className="btn reset-btn"
                onClick={handleReset}
                disabled={!linePoints.start || isLoading}
              >
                {isLoading ? '⏳' : '🔄'} Reiniciar
              </button>
              <button 
                className="btn export-btn"
                onClick={exportData}
                disabled={!profileData || isLoading}
              >
                {isLoading ? '⏳' : '💾'} RGB CSV
              </button>
              <button 
                className="btn thickness-export-btn"
                onClick={exportThicknessData}
                disabled={!thicknessData || isLoading}
              >
                {isLoading ? '⏳' : '📏'} Espesor CSV
              </button>
            </div>
          </div>

          {linePoints.start && (
            <div className="line-info">
              <h4>📐 Información de la línea:</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Inicio:</span>
                  <span className="info-value">({Math.round(linePoints.start.x)}, {Math.round(linePoints.start.y)})</span>
                </div>
                {linePoints.end && (
                  <>
                    <div className="info-item">
                      <span className="info-label">Fin:</span>
                      <span className="info-value">({Math.round(linePoints.end.x)}, {Math.round(linePoints.end.y)})</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Longitud:</span>
                      <span className="info-value">{calculateLineLength()} px</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Puntos:</span>
                      <span className="info-value">{profileData?.positions?.length || 0}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {thicknessData && (
          <div className="params-section">
            <h4>⚙️ Parámetros físicos (como en Python):</h4>
            <div className="params-grid">
              <div className="param-group">
                <label>Índice refracción (n):</label>
                <input
                  type="number"
                  step="0.01"
                  min="1.0"
                  max="2.0"
                  value={params.n}
                  onChange={(e) => handleParamChange('n', e.target.value)}
                  className="param-input"
                />
              </div>
              <div className="param-group">
                <label>λ Rojo (nm):</label>
                <input
                  type="number"
                  min="400"
                  max="700"
                  value={params.lambdaR}
                  onChange={(e) => handleParamChange('lambdaR', e.target.value)}
                  className="param-input"
                />
              </div>
              <div className="param-group">
                <label>λ Verde (nm):</label>
                <input
                  type="number"
                  min="400"
                  max="700"
                  value={params.lambdaG}
                  onChange={(e) => handleParamChange('lambdaG', e.target.value)}
                  className="param-input"
                />
              </div>
              <div className="param-group">
                <label>λ Azul (nm):</label>
                <input
                  type="number"
                  min="400"
                  max="700"
                  value={params.lambdaB}
                  onChange={(e) => handleParamChange('lambdaB', e.target.value)}
                  className="param-input"
                />
              </div>
              <div className="param-group">
                <label>Tamaño píxel (m):</label>
                <input
                  type="number"
                  step="1e-6"
                  value={params.pixelSize}
                  onChange={(e) => handleParamChange('pixelSize', e.target.value)}
                  className="param-input"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        <div className="canvas-container">
          <div className="section-header">
            <h3>🖼️ Imagen con línea de muestreo</h3>
            {isDrawing && (
              <span className="drawing-indicator">🎯 Dibujando...</span>
            )}
          </div>
          {image ? (
            <>
              <div className="canvas-wrapper">
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  className="image-canvas"
                />
              </div>
              <div className="canvas-instructions">
                <p>
                  {isDrawing ? 
                    '⚠️ Haz clic para marcar el FIN de la línea' : 
                    '👉 Haz clic para marcar el INICIO de la línea'}
                </p>
              </div>
            </>
          ) : (
            <div className="placeholder">
              <div className="placeholder-content">
                <div className="placeholder-icon">📷</div>
                <h4>No hay imagen cargada</h4>
                <p>Sube una imagen para comenzar el análisis</p>
                <button 
                  className="btn upload-placeholder-btn"
                  onClick={() => fileInputRef.current.click()}
                  disabled={isLoading}
                >
                  {isLoading ? '⏳ Cargando...' : '📁 Seleccionar imagen'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="graph-container">
          <div className="graph-tabs">
            <button 
              className={`graph-tab ${activeGraph === 'rgb' ? 'active' : ''}`}
              onClick={() => setActiveGraph('rgb')}
              disabled={isLoading}
            >
              📈 Perfil RGB
            </button>
            <button 
              className={`graph-tab ${activeGraph === 'thickness' ? 'active' : ''}`}
              onClick={() => setActiveGraph('thickness')}
              disabled={!thicknessData || isLoading}
            >
              📏 Espesor vs Posición
            </button>
          </div>

          {activeGraph === 'rgb' ? (
            profileData ? (
              <div className="graph-wrapper">
                <div className="graph-header">
                  <h4>Perfil de intensidad RGB</h4>
                  <p className="graph-subtitle">Intensidad vs Posición a lo largo de la línea</p>
                </div>
                <div className="responsive-chart">
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={rgbChartData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        dataKey="position"
                        label={{ 
                          value: 'Posición (píxeles)', 
                          position: 'insideBottom', 
                          offset: -10
                        }}
                        stroke="#555"
                      />
                      <YAxis 
                        label={{ 
                          value: 'Intensidad (0-255)', 
                          angle: -90, 
                          position: 'insideLeft'
                        }}
                        domain={[0, 255]}
                        stroke="#555"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #ccc',
                          borderRadius: '8px',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                        }}
                        formatter={(value) => [`${value}`, 'Intensidad']}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="Rojo" 
                        stroke="#ff4444" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Verde" 
                        stroke="#44ff44" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Azul" 
                        stroke="#4444ff" 
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6, strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="placeholder">
                <div className="placeholder-content">
                  <div className="placeholder-icon">📈</div>
                  <h4>Esperando datos...</h4>
                  <p>Dibuja una línea sobre la imagen para ver el perfil RGB</p>
                </div>
              </div>
            )
          ) : (
            thicknessData ? (
              <div className="graph-wrapper">
                <div className="graph-header">
                  <h4>ESPESOR vs POSICIÓN - LOS TRES COLORES</h4>
                  <p className="graph-subtitle">Interferencia en película delgada</p>
                </div>
                <div className="responsive-chart">
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart 
                      data={thicknessChartData} 
                      margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        dataKey="position"
                        label={{ 
                          value: 'Posición de Mínimos (metros)', 
                          position: 'insideBottom', 
                          offset: -10
                        }}
                        stroke="#555"
                        tickFormatter={(value) => value.toExponential(2)}
                      />
                      <YAxis 
                        label={{ 
                          value: 'Espesor (nm)', 
                          angle: -90, 
                          position: 'insideLeft'
                        }}
                        stroke="#555"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #ccc',
                          borderRadius: '8px',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
                        }}
                        formatter={(value, name) => {
                          if (name === 'Rojo') return [`${value.toFixed(2)} nm`, 'Espesor Rojo'];
                          if (name === 'Verde') return [`${value.toFixed(2)} nm`, 'Espesor Verde'];
                          if (name === 'Azul') return [`${value.toFixed(2)} nm`, 'Espesor Azul'];
                          return value;
                        }}
                        labelFormatter={(label) => `Posición: ${label.toExponential(4)} m`}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="Rojo" 
                        stroke="#ff4444" 
                        strokeWidth={3}
                        dot={{ 
                          r: 6, 
                          stroke: '#cc0000', 
                          strokeWidth: 2, 
                          fill: '#fff' 
                        }}
                        activeDot={{ r: 8, strokeWidth: 3 }}
                        name="Rojo (650 nm)"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Verde" 
                        stroke="#44ff44" 
                        strokeWidth={3}
                        dot={{ 
                          r: 6, 
                          stroke: '#00cc00', 
                          strokeWidth: 2, 
                          fill: '#fff' 
                        }}
                        activeDot={{ r: 8, strokeWidth: 3 }}
                        name="Verde (550 nm)"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Azul" 
                        stroke="#4444ff" 
                        strokeWidth={3}
                        dot={{ 
                          r: 6, 
                          stroke: '#0000cc', 
                          strokeWidth: 2, 
                          fill: '#fff' 
                        }}
                        activeDot={{ r: 8, strokeWidth: 3 }}
                        name="Azul (450 nm)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="thickness-info">
                  <p className="formula">
                    <strong>Fórmula:</strong> e = (m × λ) / (2 × n)
                    <span className="formula-desc"> | Donde: m = orden del mínimo, λ = longitud de onda, n = índice de refracción</span>
                  </p>
                  <div className="thickness-stats">
                    <div className="stat">
                      <span className="stat-label">Mínimos detectados:</span>
                      <div className="stat-values">
                        <span className="stat-value red">{thicknessData.red.length} Rojo</span>
                        <span className="stat-value green">{thicknessData.green.length} Verde</span>
                        <span className="stat-value blue">{thicknessData.blue.length} Azul</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="placeholder">
                <div className="placeholder-content">
                  <div className="placeholder-icon">📏</div>
                  <h4>Calculando espesor...</h4>
                  <p>Dibuja una línea sobre una imagen de interferencia</p>
                  <p className="subtext">El análisis funciona mejor con imágenes de burbujas o películas delgadas</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="credits">
        <p>
          <strong>✨ Desarrollado por: </strong>
          <a href="https://oscar-pab-github-io.vercel.app/" target="_blank" rel="noopener noreferrer">
            OscarDev
          </a>
          <span> | Análisis de interferencia en películas delgadas</span>
        </p>
      </div>
    </div>
  );
};

export default ImageAnalyzer;