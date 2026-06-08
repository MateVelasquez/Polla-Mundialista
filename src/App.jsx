// src/App.jsx
import { useState, useEffect } from 'react';
import { initialGroups } from './data/mundialData';
import { supabase } from './config/supabaseClient';
import html2canvas from 'html2canvas';
import './App.css';

const obtenerUrlBandera = (equipo) => {
  if (!equipo) return '';
  const nombreLower = equipo.name?.toLowerCase() || '';

  if (nombreLower.includes('escocia')) return 'https://flagcdn.com/w40/gb-sct.png';
  if (nombreLower.includes('inglaterra')) return 'https://flagcdn.com/w40/gb-eng.png';
  if (nombreLower.includes('gales')) return 'https://flagcdn.com/w40/gb-wls.png';

  try {
    const caracteres = Array.from(equipo.flag || '');
    const codigoIso = caracteres
        .map((ch) => {
          const codePoint = ch.codePointAt(0);
          if (codePoint >= 0x1F1E6 && codePoint <= 0x1F1FF) {
            return String.fromCharCode(codePoint - 0x1F1E6 + 97);
          }
          return '';
        })
        .join('');

    if (codigoIso.length === 2) {
      return `https://flagcdn.com/w40/${codigoIso}.png`;
    }
  } catch (error) {
    console.error('Error al procesar la bandera:', error);
  }

  return '';
};

// --- LOGICA DE PUNTOS REFINADA PARA EL MUNDIAL 2026 ---
const calcularPuntosPorGrupo = (prediccion, resultadoReal, listaMejoresTerceros = []) => {
  let puntos = 0;

  prediccion.forEach((equipo, indexPredicho) => {
    const indexReal = resultadoReal.indexOf(equipo);
    if (indexReal === -1) return;

    // REGLA 1: Acierto de posición exacta -> ¡3 PUNTOS SEGUROS! (aplica del 1° al 4°)
    if (indexPredicho === indexReal) {
      puntos += 3;
    }
    // REGLA 2: Clasificación cruzada -> 1 PUNTO
    else {
      // Un equipo realmente avanzó si fue 1°, 2° o si fue un 3° que entró en los mejores 8
      const avanzoReal = indexReal === 0 || indexReal === 1 || (indexReal === 2 && listaMejoresTerceros.includes(equipo));

      // El usuario predijo que avanzaría si lo puso en zona de clasificación potencial (1°, 2° o 3°)
      // El 4° puesto siempre es eliminación directa, por ende si lo puso 4° no esperaba que avance.
      const avanzoPredicho = indexPredicho < 3;

      if (avanzoReal && avanzoPredicho) {
        puntos += 1;
      }
    }
  });

  return puntos;
};

function App() {
  const [grupos, setGrupos] = useState(initialGroups);
  const [cargando, setCargando] = useState(false);
  const [generandoImagen, setGenerandoImagen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);

  const [vistaActual, setVistaActual] = useState('pronosticos');
  const [leaderboard, setLeaderboard] = useState([]);

  // --- DRAG AND DROP ---
  const handleDragStart = (grupoKey, index) => {
    setDraggedItem({ grupoKey, index });
  };

  const handleDragEnter = (grupoKey, targetIndex) => {
    if (!draggedItem || draggedItem.grupoKey !== grupoKey) return;
    if (draggedItem.index === targetIndex) return;

    const nuevoGrupo = [...grupos[grupoKey]];
    const itemMovido = nuevoGrupo[draggedItem.index];

    nuevoGrupo.splice(draggedItem.index, 1);
    nuevoGrupo.splice(targetIndex, 0, itemMovido);

    setGrupos({ ...grupos, [grupoKey]: nuevoGrupo });
    setDraggedItem({ grupoKey, index: targetIndex });
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  // --- SOPORTE TÁCTIL EXCLUSIVO PARA MÓVILES (iPhone / Samsung Galaxy) ---
  const handleTouchMove = (e, grupoKey) => {
    if (!draggedItem || draggedItem.grupoKey !== grupoKey) return;

    // 🛑 DETIENE EL SCROLL NATIVO: Evita que la pantalla se mueva junto con el dedo
    if (e.cancelable) {
      e.preventDefault();
    }

    // Obtener las coordenadas del toque actual
    const touch = e.touches[0];
    // Detectar qué elemento se encuentra exactamente debajo del dedo del usuario
    const elementoBajoDedo = document.elementFromPoint(touch.clientX, touch.clientY);
    const itemEquipo = elementoBajoDedo?.closest('.team-item');

    if (itemEquipo) {
      const targetIndex = parseInt(itemEquipo.getAttribute('data-index'), 10);
      if (!isNaN(targetIndex) && targetIndex !== draggedItem.index) {
        handleDragEnter(grupoKey, targetIndex);
      }
    }
  };

  // --- GUARDAR ---
  const guardarPronosticos = async () => {
    if (!nombre.trim()) {
      alert('⚠️ Por favor, ingresa tu nombre antes de guardar tu pronóstico.');
      return;
    }
    setCargando(true);
    const filasParaEnviar = Object.keys(grupos).map((grupoKey) => ({
      nombre_usuario: nombre.trim().toLowerCase(),
      grupo_id: grupoKey,
      orden_predicho: grupos[grupoKey].map((equipo) => equipo.name),
    }));

    try {
      const { error } = await supabase
          .from('pronosticos')
          .upsert(filasParaEnviar, { onConflict: 'nombre_usuario,grupo_id' });
      if (error) throw error;
      alert(`🏆 ¡Pronóstico de "${nombre}" guardado con éxito!`);
    } catch (error) {
      console.error(error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setCargando(false);
    }
  };

  // --- GENERAR FOTO DE RESPALDO (PC & MOBILE) ---
  const descargarFotoRespaldo = async () => {
    const contenedorCaptura = document.getElementById('zona-captura-pronosticos');
    if (!contenedorCaptura) return;

    setGenerandoImagen(true);

    setTimeout(async () => {
      try {
        const canvas = await html2canvas(contenedorCaptura, {
          useCORS: true,
          scale: 2,
          backgroundColor: '#121212',
          logging: false,
          scrollX: 0,
          scrollY: -window.scrollY
        });

        const dataUrl = canvas.toDataURL('image/png');
        const enlace = document.createElement('a');
        enlace.download = `pronostico_mundial_${nombre.trim().toLowerCase() || 'usuario'}.png`;
        enlace.href = dataUrl;
        enlace.click();

      } catch (error) {
        console.error('Error generando captura de pantalla:', error);
        alert('⚠️ Hubo un percance al generar tu foto de respaldo.');
      } finally {
        setGenerandoImagen(false);
      }
    }, 400);
  };

  // --- CARGAR LEADERBOARD ---
  const cargarLeaderboard = async () => {
    setCargando(true);
    try {
      const { data: pronosticos, error: errP } = await supabase.from('pronosticos').select('*');
      const { data: reales, error: errR } = await supabase.from('resultados_oficiales').select('*');
      const { data: terceros, error: errT } = await supabase.from('mejores_terceros').select('equipo_name');

      if (errP || errR || errT) throw errP || errR || errT;

      const listaMejoresTerceros = terceros ? terceros.map(t => t.equipo_name) : [];

      const mapaResultados = reales.reduce((acc, curr) => {
        acc[curr.grupo_id] = curr.orden_real;
        return acc;
      }, {});

      const puntajesUsuarios = {};

      pronosticos.forEach((p) => {
        const resultadoRealGrupo = mapaResultados[p.grupo_id];
        const puntosDelGrupo = resultadoRealGrupo
            ? calcularPuntosPorGrupo(p.orden_predicho, resultadoRealGrupo, listaMejoresTerceros)
            : 0;

        if (!puntajesUsuarios[p.nombre_usuario]) {
          puntajesUsuarios[p.nombre_usuario] = 0;
        }
        puntajesUsuarios[p.nombre_usuario] += puntosDelGrupo;
      });

      const rankingOrdenado = Object.keys(puntajesUsuarios).map((usuario) => ({
        nombre: usuario,
        puntosTotales: puntajesUsuarios[usuario]
      })).sort((a, b) => b.puntosTotales - a.puntosTotales);

      setLeaderboard(rankingOrdenado);
    } catch (error) {
      console.error('Error al generar el leaderboard:', error);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (vistaActual === 'posiciones') {
      cargarLeaderboard();
    }
  }, [vistaActual]);

  return (
      <div className="app-container">
        <header className="app-header">
          <h1 className="app-title">🏆Polla Mundialista 2026🏆</h1>

          <div className="tabs-container">
            <button
                className={`tab-btn ${vistaActual === 'pronosticos' ? 'active' : ''}`}
                onClick={() => setVistaActual('pronosticos')}
            >
              📋 Armar Polla Mundialista
            </button>
            <button
                className={`tab-btn ${vistaActual === 'posiciones' ? 'active' : ''}`}
                onClick={() => setVistaActual('posiciones')}
            >
              🔥 Tabla de Posiciones
            </button>
            <button
                className={`tab-btn ${vistaActual === 'reglas' ? 'active' : ''}`}
                onClick={() => setVistaActual('reglas')}
            >
              💡 Sistema de Puntuación
            </button>
          </div>
        </header>

        {vistaActual === 'pronosticos' && (
            <>
              {/* Se eliminó el estilo inline y se añadió la clase pronosticos-actions-bar */}
              <div className="app-header pronosticos-actions-bar">
                <div className="name-card">
                  <label className="name-label">👤 Tu Nombre:</label>
                  <input
                      type="text"
                      placeholder="Ej: Mateo, Carlos..."
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      className="name-input"
                  />
                </div>

                {/* Se eliminó el estilo inline y se añadió la clase action-buttons-group */}
                <div className="action-buttons-group">
                  <button onClick={guardarPronosticos} disabled={cargando} className="btn-save">
                    {cargando ? 'Guardando...' : '💾 Guardar Pronóstico Final'}
                  </button>

                  {/* Se eliminó el estilo inline y se añadió la clase btn-download */}
                  <button
                      onClick={descargarFotoRespaldo}
                      disabled={generandoImagen}
                      className="btn-save btn-download"
                  >
                    {generandoImagen ? '📸 Generando Foto...' : '📸 Descargar Foto'}
                  </button>
                </div>
              </div>

              {/* Se eliminó el estilo inline y se añadió la clase zona-captura-contenedor */}
              <div id="zona-captura-pronosticos" className="zona-captura-contenedor">
                {/* Se eliminó el estilo inline de la cabecera de la captura */}
                <div className="capture-header">
                  <h2>
                    📋 PRONÓSTICOS DE: <span className="capture-username">{nombre.trim() || 'INVITADO'}</span>
                  </h2>
                  <p>Polla Mundialista 2026 🏆</p>
                </div>

                {/* Se eliminó el estilo inline y se añadió la clase groups-grid-capture */}
                <div className="groups-grid groups-grid-capture">
                  {Object.keys(grupos).map((grupoKey) => (
                      <div key={grupoKey} className="group-card">
                        <h2 className="group-title">{grupoKey.replace('_', ' ')}</h2>
                        <div className="teams-list">
                          {grupos[grupoKey].map((equipo, index) => {
                            const urlBandera = obtenerUrlBandera(equipo);
                            const esArrastrado = draggedItem?.grupoKey === grupoKey && draggedItem?.index === index;

                            return (
                                <div
                                    key={equipo.id}
                                    className={`team-item ${esArrastrado ? 'dragging' : ''}`}
                                    draggable
                                    data-index={index}
                                    onDragStart={() => handleDragStart(grupoKey, index)}
                                    onDragEnter={() => handleDragEnter(grupoKey, index)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragEnd={handleDragEnd}
                                    onTouchStart={() => handleDragStart(grupoKey, index)}
                                    onTouchMove={(e) => handleTouchMove(e, grupoKey)}
                                    onTouchEnd={handleDragEnd}
                                >
                                  <div className="team-info">
                                    <span className="drag-handle">☰</span>
                                    <span className="team-index">{index + 1}.</span>
                                    {urlBandera ? (
                                        <img src={urlBandera} alt={equipo.name} className="team-flag-img" />
                                    ) : (
                                        <span className="team-flag">{equipo.flag}</span>
                                    )}
                                    <span className="team-name">{equipo.name}</span>
                                  </div>
                                </div>
                            );
                          })}
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            </>
        )}

        {vistaActual === 'posiciones' && (
            <div className="leaderboard-card">
              <h2 className="leaderboard-title">Ranking General de la Polla Mundialista🏆</h2>
              {cargando ? (
                  <p className="loading-text">Calculando puntajes en tiempo real...</p>
              ) : leaderboard.length === 0 ? (
                  <p className="loading-text">Aún no hay pronósticos registrados o guardados.</p>
              ) : (
                  <table className="leaderboard-table">
                    <thead>
                    <tr>
                      <th>Puesto</th>
                      <th>Participante</th>
                      <th>Puntos Totales</th>
                    </tr>
                    </thead>
                    <tbody>
                    {leaderboard.map((row, idx) => (
                        <tr key={row.nombre} className={idx === 0 ? 'podium-first' : ''}>
                          <td className="rank-cell">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                          </td>
                          <td className="user-cell">{row.nombre.toUpperCase()}</td>
                          <td className="points-cell">{row.puntosTotales} pts</td>
                        </tr>
                    ))}
                    </tbody>
                  </table>
              )}
            </div>
        )}

        {vistaActual === 'reglas' && (
            /* Se eliminaron todos los estilos inline y se sustituyeron por clases semánticas */
            <div className="leaderboard-card reglas-container">
              <h2 className="leaderboard-title reglas-title">Reglamento y Sistema de Puntuación 🎯</h2>

              <p className="reglas-description">
                El sistema evalúa tus predicciones de forma automática grupo por grupo una vez cargados los resultados oficiales. Sumarás unidades en cada grupo bajo dos reglas clave:
              </p>

              <div className="reglas-lista">

                {/* REGLA 1 */}
                <div className="regla-card regla-exacta">
                  <h3>
                    🥇 Regla 1: Posición Exacta (+3 Puntos)
                  </h3>
                  <p>
                    Si colocas a una selección en una posición específica del grupo (sea 1°, 2°, 3° o 4° puesto) y en la tabla real oficial termina <strong>exactamente en esa misma posición</strong>, te aseguras de inmediato la bonificación máxima de <strong>3 puntos</strong> por ese equipo.
                  </p>
                </div>

                {/* REGLA 2 */}
                <div className="regla-card regla-cruzada">
                  <h3>
                    🔄 Regla 2: Clasificación Cruzada (+1 Punto)
                  </h3>
                  <p>
                    Si pronosticaste que un equipo iba a clasificar a la siguiente ronda (colocándolo en 1°, 2° o 3° puesto) y el equipo <strong>efectivamente avanza a los Dieciseisavos de Final</strong>, pero fallaste la posición exacta en el grupo, sumas <strong>1 punto</strong>.
                  </p>
                  <ul>
                    <li>Un equipo en 3° puesto avanza únicamente si clasifica en el grupo oficial de los <strong>8 mejores terceros</strong> del certamen.</li>
                    <li>Colocar a un equipo en 4° puesto significa que estimas su eliminación directa, por lo tanto no califica a puntos por cruzado.</li>
                  </ul>
                </div>

                {/* NOTA ACLARATORIA */}
                <div className="regla-nota">
                  💡 <strong>Nota de consistencia:</strong> Los puntos dentro de un mismo equipo no son acumulables; se prioriza siempre la Regla 1 (3 pts) por encima de la Regla 2 (1 pt). El puntaje máximo ideal por grupo perfecto es de <strong>12 puntos</strong>.
                </div>

              </div>
            </div>
        )}
      </div>
  );
}

export default App;