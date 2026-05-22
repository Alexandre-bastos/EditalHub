import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Search, Calendar, Landmark, CreditCard, ChevronRight, X, Sparkles, Navigation, Award, DollarSign } from 'lucide-react';

interface Cargo {
  nome_cargo: string;
  quantidade: number;
}

interface Contest {
  id: string;
  nome_concurso: string;
  estado: string;
  escolaridade: string;
  salario_inicial: number;
  taxa_inscricao: number;
  inscricao_inicio: string;
  inscricao_fim: string;
  data_prova: string;
  link_inscricao: string;
  edital: {
    organizadora: {
      nome: string;
    };
  };
  resumo: string;
  compatibilidade: number;
  area: string;
  cargos: Cargo[];
}

interface Props {
  contests: Contest[];
}

// 26 Brazilian State capitals + DF coordinates
const stateCoords: Record<string, [number, number]> = {
  AC: [-9.974, -67.807],
  AL: [-9.665, -35.735],
  AP: [0.034, -51.069],
  AM: [-3.118, -60.021],
  BA: [-12.971, -38.501],
  CE: [-3.716, -38.542],
  DF: [-15.793, -47.882],
  ES: [-20.322, -40.338],
  GO: [-16.686, -49.264],
  MA: [-2.538, -44.282],
  MT: [-15.601, -56.097],
  MS: [-20.448, -54.629],
  MG: [-19.922, -43.945],
  PA: [-1.455, -48.490],
  PB: [-7.120, -34.864],
  PR: [-25.429, -49.271],
  PE: [-8.058, -34.884],
  PI: [-5.091, -42.803],
  RJ: [-22.906, -43.172],
  RN: [-5.793, -35.198],
  RS: [-30.031, -51.206],
  RO: [-8.761, -63.903],
  RR: [2.823, -60.675],
  SC: [-27.597, -48.549],
  SP: [-23.548, -46.638],
  SE: [-10.909, -37.074],
  TO: [-10.167, -48.327],
  "NACIONAL": [-15.793, -47.882],
  "RJ/ES": [-21.612, -41.755]
};

const BrazilianStates = [
  { code: 'ALL', name: 'Todos os Estados' },
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
  { code: 'NACIONAL', name: 'Nacional / Federal' }
];

function getContestCoords(estado: string): [number, number] {
  const cleanState = estado.trim().toUpperCase();
  if (stateCoords[cleanState]) {
    return stateCoords[cleanState];
  }
  for (const code of Object.keys(stateCoords)) {
    if (cleanState.includes(code)) {
      return stateCoords[code];
    }
  }
  return stateCoords["NACIONAL"]; // Fallback to DF
}

// Colors according to salary tiers
function getPinColor(salary: number): string {
  if (salary >= 15000) return '#10b981'; // Emerald (High Pay)
  if (salary >= 7000) return '#6366f1';  // Indigo (Medium Pay)
  return '#a855f7';                     // Purple (Low/Entry Pay)
}

function createPinIcon(salary: number, isSelected: boolean) {
  const color = getPinColor(salary);
  const size = isSelected ? 44 : 34;
  const shadow = isSelected ? 'rgba(99, 102, 241, 0.4)' : 'rgba(0, 0, 0, 0.15)';
  const scale = isSelected ? 'scale-110' : '';
  const strokeColor = isSelected ? '#ffffff' : '#ffffff';
  const strokeWidth = isSelected ? 2.5 : 1.5;

  return L.divIcon({
    html: `
      <div style="filter: drop-shadow(0 6px 12px ${shadow}); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);" class="${scale} cursor-pointer relative">
        <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 5.02944 7.02944 1 12 1C16.9706 1 21 5.02944 21 10Z" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>
          <circle cx="12" cy="10" r="3.5" fill="white"/>
        </svg>
        ${isSelected ? `
          <span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-600 border border-white"></span>
          </span>
        ` : ''}
      </div>
    `,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4]
  });
}

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom]);
  return null;
}

export const HomeContestMap: React.FC<Props> = ({ contests }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedSalaryTier, setSelectedSalaryTier] = useState('ALL');
  const [activeContestId, setActiveContestId] = useState<string | null>(null);

  // Default coordinate center (Brazil's geographical center - near Brasília)
  const defaultCenter: [number, number] = [-15.7938, -47.8828];
  const [center, setCenter] = useState<[number, number]>(defaultCenter);
  const [zoom, setZoom] = useState(4);

  // Filter contests dynamically
  const filteredContests = useMemo(() => {
    return contests.filter(c => {
      const matchesSearch = !searchTerm ||
        c.nome_concurso.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.edital.organizadora.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.resumo.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesState = selectedState === 'ALL' || 
        c.estado.trim().toUpperCase() === selectedState ||
        c.estado.trim().toUpperCase().includes(selectedState);

      let matchesSalary = true;
      if (selectedSalaryTier === 'HIGH') {
        matchesSalary = c.salario_inicial >= 15000;
      } else if (selectedSalaryTier === 'MEDIUM') {
        matchesSalary = c.salario_inicial >= 7000 && c.salario_inicial < 15000;
      } else if (selectedSalaryTier === 'LOW') {
        matchesSalary = c.salario_inicial < 7000;
      }

      return matchesSearch && matchesState && matchesSalary;
    });
  }, [contests, searchTerm, selectedState, selectedSalaryTier]);

  // Apply a spiral layout offset to separate markers mapping to the exact same state capital centroid
  const contestsWithJitter = useMemo(() => {
    const stateCounts: Record<string, number> = {};
    return filteredContests.map(c => {
      const baseCoords = getContestCoords(c.estado);
      const stateKey = c.estado.trim().toUpperCase();
      const count = stateCounts[stateKey] || 0;
      stateCounts[stateKey] = count + 1;

      let coords: [number, number] = [...baseCoords];
      if (count > 0) {
        // Spiral layout offset (about 12km per scale ring)
        const angle = (count * 0.75) * Math.PI;
        const radius = 0.12 * Math.sqrt(count); // dynamic expansion
        coords[0] += Math.sin(angle) * radius;
        coords[1] += Math.cos(angle) * radius;
      }

      return { ...c, coords };
    });
  }, [filteredContests]);

  const handleSelectContest = (contest: Contest & { coords: [number, number] }) => {
    setActiveContestId(contest.id);
    setCenter(contest.coords);
    setZoom(9); // zoom in closer
  };

  const handleTriggerConversion = () => {
    if (window && (window as any).openConversionModal) {
      (window as any).openConversionModal();
    } else {
      // Dispatch custom event as fallback
      document.dispatchEvent(new CustomEvent('open-conversion'));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white rounded-[2.5rem] p-4 lg:p-6 shadow-2xl border border-slate-100 max-w-7xl mx-auto min-h-[640px]">
      
      {/* 1. Sidebar Panel (5 columns) */}
      <div className="lg:col-span-5 flex flex-col h-[550px] lg:h-[650px] pr-1">
        
        {/* Filter controls */}
        <div className="space-y-4 pb-4 border-b border-slate-100 text-left">
          
          {/* Text Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por órgão, banca ou palavra-chave..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-sm font-semibold shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {/* State Filter */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest pl-1">Filtrar por Estado</label>
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/50 focus:bg-white focus:outline-none text-xs font-bold text-slate-600 cursor-pointer transition-all shadow-sm"
              >
                {BrazilianStates.map(state => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
            </div>

            {/* Salary Tier Filter */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest pl-1">Faixa Salarial</label>
              <select
                value={selectedSalaryTier}
                onChange={(e) => setSelectedSalaryTier(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/50 focus:bg-white focus:outline-none text-xs font-bold text-slate-600 cursor-pointer transition-all shadow-sm"
              >
                <option value="ALL">Qualquer Salário</option>
                <option value="HIGH">Acima de R$ 15k / Mês (Verde)</option>
                <option value="MEDIUM">Entre R$ 7k e R$ 15k (Azul)</option>
                <option value="LOW">Abaixo de R$ 7k (Roxo)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold tracking-wide mt-1">
            <span>Encontrados: <span className="text-indigo-600 font-black">{filteredContests.length}</span></span>
            {filteredContests.length < contests.length && (
              <button 
                onClick={() => { setSearchTerm(''); setSelectedState('ALL'); setSelectedSalaryTier('ALL'); }}
                className="text-indigo-600 hover:text-indigo-500 transition-colors uppercase tracking-wider font-extrabold flex items-center gap-1.5"
              >
                Limpar filtros <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Contests List */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-4 pr-1 text-left scrollbar-thin">
          {contestsWithJitter.length === 0 ? (
            <div className="text-center py-16 px-6 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
              <Landmark className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-xs text-slate-500 font-bold">Nenhum concurso ativo corresponde aos filtros selecionados.</p>
              <button 
                onClick={() => { setSearchTerm(''); setSelectedState('ALL'); setSelectedSalaryTier('ALL'); }}
                className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-100 transition-all active:scale-95"
              >
                Limpar Filtros e Ver Todos
              </button>
            </div>
          ) : (
            contestsWithJitter.map((c) => {
              const isActive = activeContestId === c.id;
              const isHighPay = c.salario_inicial >= 15000;
              const isMediumPay = c.salario_inicial >= 7000 && c.salario_inicial < 15000;
              const badgeColor = isHighPay ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : isMediumPay ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-purple-50 text-purple-700 border-purple-100';
              
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectContest(c)}
                  className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer flex flex-col justify-between gap-4 relative overflow-hidden group shadow-[0_1px_3px_rgba(0,0,0,0.01)] ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-500/[0.02] shadow-md shadow-indigo-500/5'
                      : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50/50'
                  }`}
                >
                  {/* Subtle color sidebar strip on active/hover card */}
                  <div 
                    style={{ backgroundColor: getPinColor(c.salario_inicial) }}
                    className="absolute left-0 top-0 bottom-0 w-[4.5px] transition-all opacity-40 group-hover:opacity-100"
                  ></div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[8px] font-extrabold rounded uppercase tracking-wider font-mono">
                          {c.edital.organizadora.nome}
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-extrabold rounded uppercase tracking-wider font-mono">
                          {c.estado}
                        </span>
                        {c.area && (
                          <span className="px-2 py-0.5 bg-slate-50 text-slate-500 text-[8px] font-semibold rounded uppercase tracking-wider font-mono hidden sm:inline-block">
                            {c.area}
                          </span>
                        )}
                      </div>
                      
                      <div className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-0.5 select-none font-mono">
                        ✦ {c.compatibilidade}% Match
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                        {c.nome_concurso}
                      </h3>
                      {c.cargos && c.cargos.length > 0 && (
                        <p className="text-[10px] text-slate-400 font-semibold truncate">
                          Vagas: <span className="text-slate-600 font-bold">{c.cargos[0].nome_cargo}</span> {c.cargos.length > 1 ? `e mais ${c.cargos.length - 1} cargos` : ''}
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed font-light">
                      {c.resumo}
                    </p>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-100 pt-3 mt-1">
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-[8px] uppercase tracking-widest font-extrabold">Salário Inicial</span>
                      <span className={`text-xs font-black font-mono px-2 py-0.5 rounded border mt-0.5 ${badgeColor}`}>
                        R$ {c.salario_inicial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTriggerConversion();
                      }}
                      className="px-3 py-2 bg-slate-50 text-slate-600 group-hover:bg-slate-900 group-hover:text-white rounded-lg text-[9px] font-extrabold transition-all duration-300 flex items-center gap-1 cursor-pointer uppercase tracking-wider border border-slate-200 group-hover:border-transparent active:scale-95 shadow-sm"
                    >
                      Ver Detalhes
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Map Area (7 columns) */}
      <div className="lg:col-span-7 h-[350px] lg:h-[650px] rounded-[2rem] overflow-hidden shadow-inner border border-slate-100 relative z-10">
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <ChangeView center={center} zoom={zoom} />
          
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />

          {contestsWithJitter.map((c) => {
            const isSelected = activeContestId === c.id;
            const markerIcon = createPinIcon(c.salario_inicial, isSelected);
            
            return (
              <Marker
                key={c.id}
                position={c.coords}
                icon={markerIcon}
                eventHandlers={{
                  click: () => setActiveContestId(c.id)
                }}
              >
                <Popup>
                  <div className="p-2 min-w-[230px] text-left text-slate-800 font-sans leading-normal">
                    <div className="flex justify-between items-center gap-2 mb-2">
                      <span className="px-1.5 py-0.2 bg-indigo-50 border border-indigo-100 text-indigo-600 text-[8px] font-extrabold rounded uppercase tracking-wider font-mono">
                        {c.edital.organizadora.nome}
                      </span>
                      <span className="px-1.5 py-0.2 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[8px] font-bold rounded uppercase tracking-wider font-mono">
                        ✓ Match {c.compatibilidade}%
                      </span>
                    </div>

                    <h4 className="font-extrabold text-slate-900 text-xs m-0 leading-snug line-clamp-2">
                      {c.nome_concurso}
                    </h4>
                    
                    <div className="space-y-1 mt-2.5 text-[10px] text-slate-600 font-medium">
                      <p className="flex items-center gap-1.5 m-0 leading-tight">
                        <Award className="w-3.5 h-3.5 text-indigo-500" />
                        <span><strong>Escolaridade:</strong> {c.escolaridade}</span>
                      </p>
                      <p className="flex items-center gap-1.5 m-0 leading-tight">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                        <span><strong>Salário:</strong> R$ {c.salario_inicial.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                      </p>
                      {c.data_prova && (
                        <p className="flex items-center gap-1.5 m-0 leading-tight">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span><strong>Prova:</strong> {new Date(c.data_prova).toLocaleDateString('pt-BR')}</span>
                        </p>
                      )}
                    </div>

                    {c.resumo && (
                      <p className="text-[9.5px] text-slate-400 font-light leading-relaxed mt-2 border-t border-slate-100 pt-2 line-clamp-2">
                        {c.resumo}
                      </p>
                    )}

                    <button
                      onClick={handleTriggerConversion}
                      className="w-full mt-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[9.5px] rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center gap-1 uppercase tracking-wider cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Desbloquear Edital Completo
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Sleek dynamic floating legend in the map corner */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-md px-3.5 py-3 rounded-2xl border border-slate-200/50 shadow-lg pointer-events-none select-none text-left">
          <div className="space-y-1.5">
            <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest block pb-1 border-b border-slate-100">Legenda Salarial</span>
            <div className="flex items-center gap-2 text-[9px] font-bold text-slate-600">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white shadow-sm"></div>
              <span>R$ 15k+ (Classe A)</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-slate-600">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white shadow-sm"></div>
              <span>R$ 7k - 15k (Classe B)</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-slate-600">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-white shadow-sm"></div>
              <span>Até R$ 7k (Classe C)</span>
            </div>
          </div>
        </div>

        {/* Telemetry info inside map for tech aesthetic */}
        <div className="absolute top-4 right-4 z-[1000] bg-slate-900/80 backdrop-blur-sm rounded-xl p-2.5 text-[8.5px] font-mono text-slate-300 shadow-sm flex flex-col gap-0.5 pointer-events-none select-none text-left border border-white/10">
          <span className="text-emerald-400 font-extrabold flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> DB_MAP: CONCURSOS_ATIVOS
          </span>
          <span>GEOPOSITION: ACTIVE HUBS</span>
          <span>PROVIDER: CARTODB LIGHT</span>
        </div>
      </div>
      
    </div>
  );
};

export default HomeContestMap;
