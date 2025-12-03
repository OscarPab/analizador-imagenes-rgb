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
  ResponsiveContainer
} from 'recharts';
import './ImageAnalyzer.css';

const ImageAnalyzer = () => {
  const [image, setImage] = useState(null);
  const [linePoints, setLinePoints] = useState({ start: null, end: null });
  const [profileData, setProfileData] = useState(null);
  const [thicknessData, setThicknessData] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [smoothing, setSmoothing] = useState(5);
  const [activeGraph, setActiveGraph] = useState('rgb');
  
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [scale, setScale] = useState(1);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setLinePoints({ start: null, end: null });
        setProfileData(null);
        setThicknessData(null);
        setIsDrawing(false);
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
      
      // Calcular tamaño del canvas manteniendo proporción
      const maxWidth = 800;
      const maxHeight = 500;
      
      const widthRatio = maxWidth / image.width;
      const heightRatio = maxHeight / image.height;
      const ratio = Math.min(widthRatio, heightRatio);
      
      const displayWidth = image.width * ratio;
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
          
          // Dibujar punto final
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
        
        // Dibujar punto inicial
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
    if (!image) return;

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

    // Suavizado simple
    const smoothData = (data) => {
      if (data.length <= smoothing) return data;
      
      const smoothed = [];
      const halfWindow = Math.floor(smoothing / 2);
      
      for (let i = 0; i < data.length; i++) {
        let sum = 0;
        let count = 0;
        
        for (let j = Math.max(0, i - halfWindow); j <= Math.min(data.length - 1, i + halfWindow); j++) {
          sum += data[j];
          count++;
        }
        
        smoothed.push(Math.round(sum / count));
      }
      
      return smoothed;
    };

    const smoothedProfile = {
      positions: profile.positions,
      red: smoothData(profile.red),
      green: smoothData(profile.green),
      blue: smoothData(profile.blue),
      rawRed: profile.red,
      rawGreen: profile.green,
      rawBlue: profile.blue
    };

    setProfileData(smoothedProfile);
    calculateThickness(smoothedProfile);
  };

  const calculateThickness = (profile) => {
    // Encontrar mínimos locales
    const findMinima = (data) => {
      const minima = [];
      for (let i = 5; i < data.length - 5; i++) {
        if (
          data[i] < data[i-2] && data[i] < data[i-1] &&
          data[i] < data[i+1] && data[i] < data[i+2]
        ) {
          minima.push(i);
        }
      }
      return minima;
    };
    
    const minR = findMinima(profile.red);
    const minG = findMinima(profile.green);
    const minB = findMinima(profile.blue);
    
    // Parámetros físicos (como en Python)
    const n = 1.33;
    const lambdaR = 650; // nm
    const lambdaG = 550; // nm
    const lambdaB = 450; // nm
    const pixelSize = 3.09e-5; // metros por píxel
    
    // Calcular espesores: e = m * λ / (2 * n)
    const calculateThicknessForColor = (minima, lambda) => {
      return minima.map((position, index) => ({
        positionPx: position,
        positionM: position * pixelSize, // Convertir a metros
        thickness: (index * lambda) / (2 * n),
        order: index
      }));
    };
    
    const thicknessR = calculateThicknessForColor(minR, lambdaR);
    const thicknessG = calculateThicknessForColor(minG, lambdaG);
    const thicknessB = calculateThicknessForColor(minB, lambdaB);
    
    setThicknessData({ 
      red: thicknessR, 
      green: thicknessG, 
      blue: thicknessB 
    });
  };

  const handleReset = () => {
    setLinePoints({ start: null, end: null });
    setProfileData(null);
    setThicknessData(null);
    setIsDrawing(false);
  };

  const exportData = () => {
    if (!profileData) return;
    
    let csvContent = "Posicion,Rojo,Verde,Azul\n";
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

  const chartData = profileData ? profileData.positions.map((pos, idx) => ({
    position: pos,
    Rojo: profileData.red[idx],
    Verde: profileData.green[idx],
    Azul: profileData.blue[idx]
  })) : [];

  // Preparar datos para gráfica de espesor (LÍNEA CONTINUA como en Python)
  const getThicknessChartData = () => {
    if (!thicknessData) return [];
    
    // Crear datos para cada color por separado
    const redData = thicknessData.red.map(item => ({
      position: item.positionM,
      Espesor: item.thickness,
      Color: 'Rojo',
      Orden: item.order
    }));
    
    const greenData = thicknessData.green.map(item => ({
      position: item.positionM,
      Espesor: item.thickness,
      Color: 'Verde',
      Orden: item.order
    }));
    
    const blueData = thicknessData.blue.map(item => ({
      position: item.positionM,
      Espesor: item.thickness,
      Color: 'Azul',
      Orden: item.order
    }));
    
    // Ordenar por posición
    return [...redData, ...greenData, ...blueData].sort((a, b) => a.position - b.position);
  };

  const thicknessChartData = getThicknessChartData();

  return (
    <div className="image-analyzer">
      <div className="controls">
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

        <div className="settings">
          <div className="smoothing-control">
            <label>Suavizado: <strong>{smoothing}</strong></label>
            <input
              type="range"
              min="1"
              max="21"
              value={smoothing}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setSmoothing(newValue);
                if (profileData && linePoints.start && linePoints.end) {
                  extractProfile(linePoints);
                }
              }}
              disabled={!profileData}
            />
            <div className="slider-labels">
              <span>Bajo</span>
              <span>Alto</span>
            </div>
          </div>

          <div className="action-buttons">
            <button 
              className="btn reset-btn"
              onClick={handleReset}
              disabled={!linePoints.start}
            >
              🔄 Reiniciar
            </button>
            <button 
              className="btn export-btn"
              onClick={exportData}
              disabled={!profileData}
            >
              💾 Exportar CSV
            </button>
          </div>
        </div>

        {linePoints.start && (
          <div className="line-details">
            <h4>Información de la línea:</h4>
            <div className="details-grid">
              <div>
                <span className="label">Inicio:</span>
                <span className="value">({Math.round(linePoints.start.x)}, {Math.round(linePoints.start.y)})</span>
              </div>
              {linePoints.end && (
                <>
                  <div>
                    <span className="label">Fin:</span>
                    <span className="value">({Math.round(linePoints.end.x)}, {Math.round(linePoints.end.y)})</span>
                  </div>
                  <div>
                    <span className="label">Longitud:</span>
                    <span className="value">{calculateLineLength()} px</span>
                  </div>
                  <div>
                    <span className="label">Puntos:</span>
                    <span className="value">{profileData?.positions?.length || 0}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        <div className="canvas-section">
          <h3>📐 Imagen con línea de muestreo</h3>
          {image ? (
            <>
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="image-canvas"
              />
              <div className="canvas-instructions">
                <p>
                  {isDrawing ? 
                    '⚠️ Haz clic para marcar el FIN de la línea' : 
                    '👉 Haz clic para marcar el INICIO de la línea'}
                </p>
              </div>
            </>
          ) : (
            <div className="canvas-placeholder">
              <div className="placeholder-content">
                <div className="placeholder-icon">📷</div>
                <h4>No hay imagen cargada</h4>
                <p>Sube una imagen para comenzar el análisis</p>
                <button 
                  className="btn upload-placeholder-btn"
                  onClick={() => fileInputRef.current.click()}
                >
                  Seleccionar imagen
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="graph-section">
          <div className="graph-tabs">
            <button 
              className={`graph-tab ${activeGraph === 'rgb' ? 'active' : ''}`}
              onClick={() => setActiveGraph('rgb')}
            >
              📈 Perfil RGB
            </button>
            <button 
              className={`graph-tab ${activeGraph === 'thickness' ? 'active' : ''}`}
              onClick={() => setActiveGraph('thickness')}
              disabled={!thicknessData}
            >
              📏 Espesor vs Posición
            </button>
          </div>

          {activeGraph === 'rgb' ? (
            profileData ? (
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis 
                      dataKey="position"
                      label={{ 
                        value: 'Posición (píxeles)', 
                        position: 'insideBottom', 
                        offset: -10,
                        style: { fill: '#666' }
                      }}
                      stroke="#666"
                    />
                    <YAxis 
                      label={{ 
                        value: 'Intensidad (0-255)', 
                        angle: -90, 
                        position: 'insideLeft',
                        style: { fill: '#666' }
                      }}
                      domain={[0, 255]}
                      stroke="#666"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #ccc',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="Rojo" 
                      stroke="#ff4444" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="Verde" 
                      stroke="#44ff44" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="Azul" 
                      stroke="#4444ff" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                
                {profileData && (
                  <div className="stats">
                    <h4>📊 Estadísticas RGB</h4>
                    <div className="stats-grid">
                      <div className="stat-item red">
                        <span className="stat-label">Rojo máximo:</span>
                        <span className="stat-value">{Math.max(...profileData.red)}</span>
                      </div>
                      <div className="stat-item green">
                        <span className="stat-label">Verde máximo:</span>
                        <span className="stat-value">{Math.max(...profileData.green)}</span>
                      </div>
                      <div className="stat-item blue">
                        <span className="stat-label">Azul máximo:</span>
                        <span className="stat-value">{Math.max(...profileData.blue)}</span>
                      </div>
                      <div className="stat-item gray">
                        <span className="stat-label">Promedio RGB:</span>
                        <span className="stat-value">
                          {Math.round((profileData.red.reduce((a,b)=>a+b,0) + 
                            profileData.green.reduce((a,b)=>a+b,0) + 
                            profileData.blue.reduce((a,b)=>a+b,0)) / (profileData.positions.length * 3))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="graph-placeholder">
                <div className="placeholder-content">
                  <div className="placeholder-icon">📈</div>
                  <h4>Esperando datos...</h4>
                  <p>Dibuja una línea sobre la imagen para ver el perfil RGB</p>
                </div>
              </div>
            )
          ) : (
            thicknessData ? (
              <div className="thickness-chart-wrapper">
                <div className="thickness-header">
                  <h4>ESPESOR vs POSICIÓN - LOS TRES COLORES</h4>
                  <p className="thickness-subtitle">Interferencia en película delgada</p>
                </div>
                
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart
                    data={thicknessChartData}
                    margin={{ top: 20, right: 30, left: 60, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis 
                      dataKey="position"
                      type="number"
                      label={{ 
                        value: 'Posición de Mínimos (metros)', 
                        position: 'insideBottom', 
                        offset: -5,
                        style: { fill: '#333', fontSize: '12px' }
                      }}
                      stroke="#333"
                      tickFormatter={(value) => value.toExponential(2)}
                    />
                    <YAxis 
                      type="number"
                      label={{ 
                        value: 'Espesor (nm)', 
                        angle: -90, 
                        position: 'insideLeft',
                        style: { fill: '#333', fontSize: '12px' }
                      }}
                      stroke="#333"
                    />
                    <Tooltip 
                      formatter={(value, name) => {
                        if (name === 'Espesor') return [`${value.toFixed(2)} nm`, 'Espesor'];
                        return value;
                      }}
                      labelFormatter={(label) => `Posición: ${label.toExponential(4)} m`}
                      contentStyle={{ 
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        border: '1px solid #ccc',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Legend />
                    
                    {/* Línea para Rojo */}
                    <Line 
                      type="monotone" 
                      dataKey="Espesor" 
                      data={thicknessChartData.filter(d => d.Color === 'Rojo')}
                      stroke="#ff4444" 
                      strokeWidth={2}
                      dot={{ 
                        r: 6, 
                        stroke: '#cc0000', 
                        strokeWidth: 2, 
                        fill: '#fff' 
                      }}
                      activeDot={{ r: 8, strokeWidth: 2 }}
                      name="Rojo (650 nm)"
                      connectNulls={true}
                    />
                    
                    {/* Línea para Verde */}
                    <Line 
                      type="monotone" 
                      dataKey="Espesor" 
                      data={thicknessChartData.filter(d => d.Color === 'Verde')}
                      stroke="#44ff44" 
                      strokeWidth={2}
                      dot={{ 
                        r: 6, 
                        stroke: '#00cc00', 
                        strokeWidth: 2, 
                        fill: '#fff' 
                      }}
                      activeDot={{ r: 8, strokeWidth: 2 }}
                      name="Verde (550 nm)"
                      connectNulls={true}
                    />
                    
                    {/* Línea para Azul */}
                    <Line 
                      type="monotone" 
                      dataKey="Espesor" 
                      data={thicknessChartData.filter(d => d.Color === 'Azul')}
                      stroke="#4444ff" 
                      strokeWidth={2}
                      dot={{ 
                        r: 6, 
                        stroke: '#0000cc', 
                        strokeWidth: 2, 
                        fill: '#fff' 
                      }}
                      activeDot={{ r: 8, strokeWidth: 2 }}
                      name="Azul (450 nm)"
                      connectNulls={true}
                    />
                    
                  </LineChart>
                </ResponsiveContainer>
                
                <div className="thickness-info">
                  <div className="formula-box">
                    <strong>Fórmula:</strong> e = (m × λ) / (2 × n)
                    <br />
                    <small>Donde: m = orden del mínimo, λ = longitud de onda, n = índice de refracción (1.33)</small>
                  </div>
                  
                  <div className="thickness-stats">
                    <div className="thickness-stat-item">
                      <span className="thickness-stat-label">Mínimos Rojo:</span>
                      <span className="thickness-stat-value red">{thicknessData.red.length}</span>
                    </div>
                    <div className="thickness-stat-item">
                      <span className="thickness-stat-label">Mínimos Verde:</span>
                      <span className="thickness-stat-value green">{thicknessData.green.length}</span>
                    </div>
                    <div className="thickness-stat-item">
                      <span className="thickness-stat-label">Mínimos Azul:</span>
                      <span className="thickness-stat-value blue">{thicknessData.blue.length}</span>
                    </div>
                    <div className="thickness-stat-item">
                      <span className="thickness-stat-label">Espesor máximo:</span>
                      <span className="thickness-stat-value">
                        {Math.max(
                          ...thicknessData.red.map(d => d.thickness),
                          ...thicknessData.green.map(d => d.thickness),
                          ...thicknessData.blue.map(d => d.thickness)
                        ).toFixed(2)} nm
                      </span>
                    </div>
                  </div>
                  
                  <button 
                    className="btn thickness-export-btn"
                    onClick={exportThicknessData}
                  >
                    📏 Exportar Espesor CSV
                  </button>
                </div>
              </div>
            ) : (
              <div className="graph-placeholder">
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
    </div>
  );
};

export default ImageAnalyzer;