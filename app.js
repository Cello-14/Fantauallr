// Dashboard FANTAUALLR: legge dati/dashboard.json e disegna le sezioni. Interfaccia generata con Gemini, collaudata e corretta.
// --- 2. STATO GLOBALE ---
const State = {
    data: null,
    view: 'home',
    theme: 'dark',
    carouselTimers: {},
    chartInstance: null
};

// API Fittizia per Scommesse (come da PRD §6)
window.FantaAPI = {
    accedi: () => { console.log('Mock: Login'); },
    esci: () => { console.log('Mock: Logout'); },
    saldo: () => 100,
    giocate: () => [],
    piazza: (schedina) => { console.log('Mock: Piazzata', schedina); return true; },
    classifica: () => []
};

// --- STREAMING_CHUNK:Utility Functions... ---
// Helper formatting (Formati italiani)
const formatNumber = (num, decimals = 1) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
const formatEuro = (num) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(num);
const formatDate = (dateStr) => {
    if(!dateStr) return '';
    const d = new Date(dateStr);
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    if (dateStr.includes('T')) { options.hour = '2-digit'; options.minute = '2-digit'; }
    return d.toLocaleDateString('it-IT', options).replace(',', '');
};

// Helper fallback immagini
const renderStemma = (squadra, sizeClass = 'w-10 h-10') => {
    if(!squadra) return '';
    return `
        <div class="stemma-container ${sizeClass}">
            <img src="${squadra.stemma}" alt="${squadra.nome}" 
                 class="w-full h-full object-contain p-1" 
                 onerror="this.onerror=null; this.outerHTML='<span class=\\'font-bold text-gray-700 text-xs\\'>${squadra.sigla}</span>'">
        </div>
    `;
};

// Colore dinamico per V/N/P
const getColorClass = (val) => val > 0 ? 'text-accent' : (val < 0 ? 'text-danger' : 'text-muted');

// --- STREAMING_CHUNK:App Initialization and Fetching... ---
async function initApp() {
    loadPreferences();
    applyTheme();
    bindEvents();
    
    try {
        // Tentativo di fetch reale
        const response = await fetch('dati/dashboard.json', { cache: 'no-cache' }); // sempre i dati più recenti
        if(!response.ok) throw new Error('Network response was not ok');
        State.data = await response.json();
    } catch (e) {
        console.error('Impossibile leggere dati/dashboard.json', e);
        State.data = null;
    }
    
    updateHeader();
    renderView();
}

function loadPreferences() {
    try {
        const savedTheme = localStorage.getItem('fantauallr_theme');
        if (savedTheme) State.theme = savedTheme;
        else State.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch(e) {}
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', State.theme);
    const sun = document.getElementById('icon-sun');
    const moon = document.getElementById('icon-moon');
    if(State.theme === 'dark') {
        sun.classList.remove('hidden'); moon.classList.add('hidden');
    } else {
        sun.classList.add('hidden'); moon.classList.remove('hidden');
    }
}

function toggleTheme() {
    State.theme = State.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('fantauallr_theme', State.theme); } catch(e) {}
    applyTheme();
    if(State.chartInstance) renderEloChart(); // Ridisegna per colori
}

function bindEvents() {
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('hidden');
        sidebar.classList.toggle('absolute');
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-btn').forEach(b => {
                b.classList.remove('bg-white/10', 'text-main');
                b.classList.add('text-muted');
            });
            const target = e.currentTarget;
            target.classList.remove('text-muted');
            target.classList.add('bg-white/10', 'text-main');
            
            State.view = target.dataset.view;
            if(window.innerWidth < 768) document.getElementById('sidebar').classList.add('hidden');
            renderView();
        });
    });
}

function updateHeader() {
    if(!State.data) return;
    document.getElementById('desktop-league-name').innerText = State.data.lega.nome;
    document.getElementById('mobile-league-name').innerText = State.data.lega.nome;
    document.getElementById('league-season').innerText = `Stagione ${State.data.lega.stagione}` + (State.data.ultima_giornata?.giornata ? ` • Giornata ${State.data.ultima_giornata.giornata}` : '');
    
    const dateStr = State.data.aggiornato ? formatDate(State.data.aggiornato) : 'Sconosciuto';
    document.getElementById('last-updated').innerText = `Aggiornato il ${dateStr}`;
}

// --- STREAMING_CHUNK:Router & Rendering Logic... ---
function renderView() {
    const container = document.getElementById('view-container');
    const title = document.getElementById('page-title');
    const subtitle = document.getElementById('page-subtitle');
    
    // Pulisci timer attivi
    Object.values(State.carouselTimers).forEach(clearInterval);
    State.carouselTimers = {};

    if(!State.data) {
        container.innerHTML = `<div class="p-8 text-center text-muted">Dati non disponibili, riprova più tardi.</div>`;
        return;
    }

    switch(State.view) {
        case 'home':
            title.innerText = 'Dashboard';
            subtitle.innerText = State.data.ultima_giornata?.giornata ? `Riepilogo Giornata ${State.data.ultima_giornata.giornata}` : 'La stagione sta per iniziare';
            renderHome(container);
            break;
        case 'classifiche':
            title.innerText = 'Classifiche';
            subtitle.innerText = 'Tutte le competizioni';
            renderClassifiche(container);
            break;
        case 'elo':
            title.innerText = 'Rating Elo';
            subtitle.innerText = 'Indice di forza delle squadre';
            renderElo(container);
            break;
        case 'ranking':
            title.innerText = 'Ranking Allenatori';
            subtitle.innerText = 'Storico pluriennale';
            renderRanking(container);
            break;
        case 'mercato':
            title.innerText = 'Mercato';
            subtitle.innerText = 'Stato e ultime operazioni';
            renderMercato(container);
            break;
        case 'previsioni':
        case 'quote':
        case 'scommettitori': {
            const info = {
                previsioni: ['Previsioni', 'Probabilità di fine stagione',
                    "Tabella con la probabilità di ogni squadra di chiudere il Campionato in ciascuna posizione. Comparirà quando almeno una posizione sarà diventata matematicamente impossibile per almeno una squadra."],
                quote: ['Quote', 'Prossima giornata',
                    "Quote 1 · X · 2 delle partite della prossima giornata. Accedendo con la tua email potrai scommettere con crediti virtuali, anche con schedine multiple, fino alla scadenza delle formazioni."],
                scommettitori: ['Classifica Scommettitori', 'Chi scommette meglio',
                    "Classifica per guadagno netto in crediti, stagionale e di sempre, con le statistiche: quota più alta vinta, più pronostici indovinati, schedina multipla più ricca, percentuale di scommesse vinte."]
            }[State.view];
            title.innerText = info[0];
            subtitle.innerText = info[1];
            container.innerHTML = `
                <div class="surface rounded-2xl p-12 text-center flex flex-col items-center justify-center border border-theme">
                    <span class="text-6xl mb-4 opacity-50">🚧</span>
                    <h3 class="text-2xl font-bold mb-2">In arrivo</h3>
                    <p class="text-muted max-w-md">${info[2]}</p>
                </div>
            `;
            break;
        }
    }
}

// --- STREAMING_CHUNK:View - Home (Carousels & Widgets)... ---
function renderHome(container) {
    const d = State.data;
    const uGiornata = d.ultima_giornata;
    const pGiornata = d.prossima_giornata;
    
    // Widgets
    let marketText = "Chiuso";
    let marketColor = "text-danger";
    if(d.mercato?.aperto) {
        marketText = `Aperto fino al ${formatDate(d.mercato.finestra_aperta?.fino_al)}`;
        marketColor = "text-accent";
    }
    
    let capolista = "N/D";
    try { capolista = d.competizioni.Campionato.fasi[0].classifica[0].squadra.nome; } catch(e){}
    
    let bestElo = "N/D";
    try { bestElo = d.elo.classifica[0].squadra.nome; } catch(e){}

    const html = `
        <!-- Widgets -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div class="surface p-4 rounded-2xl border border-theme flex flex-col justify-center">
                <span class="text-xs text-muted font-semibold uppercase tracking-wider mb-1">Capolista</span>
                <span class="font-bold text-lg leading-tight truncate">${capolista}</span>
            </div>
            <div class="surface p-4 rounded-2xl border border-theme flex flex-col justify-center">
                <span class="text-xs text-muted font-semibold uppercase tracking-wider mb-1">Miglior Elo</span>
                <span class="font-bold text-lg leading-tight truncate">${bestElo}</span>
            </div>
            <div class="surface p-4 rounded-2xl border border-theme flex flex-col justify-center">
                <span class="text-xs text-muted font-semibold uppercase tracking-wider mb-1">Mercato</span>
                <span class="font-bold text-sm ${marketColor} leading-tight">${marketText}</span>
            </div>
            <div class="surface p-4 rounded-2xl border border-theme flex flex-col justify-center">
                <span class="text-xs text-muted font-semibold uppercase tracking-wider mb-1">Scadenza formazioni${pGiornata?.giornata ? ' · G. ' + pGiornata.giornata : ''}</span>
                <span class="font-bold text-sm leading-tight">${pGiornata?.scadenza_formazioni ? formatDate(pGiornata.scadenza_formazioni) : 'Non ancora inserita'}</span>
            </div>
        </div>

        <!-- Caroselli -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <!-- Ultima Giornata -->
            <div class="surface rounded-3xl border border-theme overflow-hidden flex flex-col h-80 relative group" id="carousel-ultima">
                <div class="bg-black/20 p-4 border-b border-theme flex justify-between items-center z-10">
                    <h3 class="font-bold text-lg">Ultimi Risultati <span class="text-muted text-sm ml-2">G. ${uGiornata?.giornata || '-'}</span></h3>
                    <div class="flex items-center gap-2"><button class="car-nav w-7 h-7 rounded-full border border-theme text-muted hover:text-main" data-car="ultima" data-dir="-1" aria-label="Partita precedente">‹</button><div class="flex gap-1" id="dots-ultima"></div><button class="car-nav w-7 h-7 rounded-full border border-theme text-muted hover:text-main" data-car="ultima" data-dir="1" aria-label="Partita successiva">›</button></div>
                </div>
                <div class="carousel-track flex overflow-x-auto snap-x snap-mandatory hide-scrollbar flex-1 relative" id="track-ultima">
                    ${uGiornata?.partite.map(p => renderMatchCardLast(p)).join('') || '<div class="w-full flex items-center justify-center">Nessun dato</div>'}
                </div>
                <div class="h-1 bg-white/10 w-full absolute bottom-0 z-20">
                    <div class="h-full bg-accent w-0 transition-all duration-100 ease-linear" id="progress-ultima"></div>
                </div>
            </div>

            <!-- Prossima Giornata -->
            <div class="surface rounded-3xl border border-theme overflow-hidden flex flex-col h-80 relative group" id="carousel-prossima">
                <div class="bg-black/20 p-4 border-b border-theme flex justify-between items-center z-10">
                    <h3 class="font-bold text-lg">Prossime Sfide <span class="text-muted text-sm ml-2">G. ${pGiornata?.giornata || '-'}</span></h3>
                    <div class="flex items-center gap-2"><button class="car-nav w-7 h-7 rounded-full border border-theme text-muted hover:text-main" data-car="prossima" data-dir="-1" aria-label="Partita precedente">‹</button><div class="flex gap-1" id="dots-prossima"></div><button class="car-nav w-7 h-7 rounded-full border border-theme text-muted hover:text-main" data-car="prossima" data-dir="1" aria-label="Partita successiva">›</button></div>
                </div>
                <div class="carousel-track flex overflow-x-auto snap-x snap-mandatory hide-scrollbar flex-1 relative" id="track-prossima">
                    ${pGiornata?.partite.map(p => renderMatchCardNext(p)).join('') || '<div class="w-full flex items-center justify-center">Nessun dato</div>'}
                </div>
                <div class="h-1 bg-white/10 w-full absolute bottom-0 z-20">
                    <div class="h-full bg-accent w-0 transition-all duration-100 ease-linear" id="progress-prossima"></div>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;

    if(uGiornata?.partite?.length) initCarousel('ultima', uGiornata.partite.length);
    if(pGiornata?.partite?.length) initCarousel('prossima', pGiornata.partite.length);
}

function renderMatchCardLast(partita) {
    const vCasa = partita.gol[0] > partita.gol[1];
    const vTras = partita.gol[1] > partita.gol[0];
    const dts = partita.supplementari_vinti_da ? `<div class="text-xs text-accent mt-2 text-center">d.t.s. vinti da ${partita.supplementari_vinti_da}</div>` : '';

    return `
        <div class="min-w-full w-full flex-shrink-0 snap-center flex flex-col items-center justify-center p-6 relative">
            <span class="absolute top-4 bg-white/10 text-xs px-3 py-1 rounded-full font-semibold border border-theme">${partita.competizione}</span>
            
            <div class="flex items-center justify-between w-full max-w-sm mt-4">
                <!-- Casa -->
                <div class="flex flex-col items-center w-1/3">
                    ${renderStemma(partita.casa, 'w-16 h-16 mb-2')}
                    <span class="font-bold text-sm text-center line-clamp-1 ${vCasa ? 'text-accent' : ''}">${partita.casa.nome}</span>
                    <span class="text-xs text-muted">${formatNumber(partita.fantapunti[0])} fp</span>
                </div>
                
                <!-- Score -->
                <div class="flex flex-col items-center justify-center w-1/3 px-2">
                    <div class="text-4xl font-black bg-black/30 px-4 py-2 rounded-xl border border-theme shadow-inner tracking-widest">
                        ${partita.gol[0]}<span class="text-muted text-2xl mx-1">-</span>${partita.gol[1]}
                    </div>
                </div>
                
                <!-- Trasferta -->
                <div class="flex flex-col items-center w-1/3">
                    ${renderStemma(partita.trasferta, 'w-16 h-16 mb-2')}
                    <span class="font-bold text-sm text-center line-clamp-1 ${vTras ? 'text-accent' : ''}">${partita.trasferta.nome}</span>
                    <span class="text-xs text-muted">${formatNumber(partita.fantapunti[1])} fp</span>
                </div>
            </div>
            ${dts}
        </div>
    `;
}

function renderMatchCardNext(partita) {
    let eloBar = '';
    if(partita.elo) {
        const pCasa = (partita.elo.atteso_casa * 100).toFixed(0);
        const pTras = (100 - pCasa).toFixed(0);
        eloBar = `
            <div class="w-full max-w-sm mt-6">
                <div class="flex justify-between text-xs text-muted mb-1">
                    <span>Elo: ${partita.elo.casa.toFixed(0)}</span>
                    <span class="uppercase tracking-widest text-[10px]">Indice Forza</span>
                    <span>Elo: ${partita.elo.trasferta.toFixed(0)}</span>
                </div>
                <div class="h-2 w-full bg-black/30 rounded-full overflow-hidden flex border border-theme">
                    <div class="h-full bg-accent" style="width: ${pCasa}%"></div>
                    <div class="h-full bg-white/20" style="width: ${pTras}%"></div>
                </div>
                <div class="flex justify-between text-xs font-bold mt-1">
                    <span class="text-accent">${pCasa}%</span>
                    <span>${pTras}%</span>
                </div>
            </div>
        `;
    }

    let odds = '';
    if(partita.quote) {
        odds = `
            <div class="flex gap-2 w-full max-w-sm mt-4">
                <button class="flex-1 surface hover:bg-white/10 border border-theme py-2 rounded-lg text-sm font-bold flex flex-col items-center transition-colors">
                    <span class="text-xs text-muted font-normal">1</span>${partita.quote["1"].toFixed(2)}
                </button>
                <button class="flex-1 surface hover:bg-white/10 border border-theme py-2 rounded-lg text-sm font-bold flex flex-col items-center transition-colors">
                    <span class="text-xs text-muted font-normal">X</span>${partita.quote["X"].toFixed(2)}
                </button>
                <button class="flex-1 surface hover:bg-white/10 border border-theme py-2 rounded-lg text-sm font-bold flex flex-col items-center transition-colors">
                    <span class="text-xs text-muted font-normal">2</span>${partita.quote["2"].toFixed(2)}
                </button>
            </div>
        `;
    }

    return `
        <div class="min-w-full w-full flex-shrink-0 snap-center flex flex-col items-center justify-center p-6 relative">
            <span class="absolute top-4 bg-white/10 text-xs px-3 py-1 rounded-full font-semibold border border-theme">${partita.competizione}</span>
            
            <div class="flex items-center justify-between w-full max-w-sm mt-4">
                <div class="flex flex-col items-center w-5/12">
                    ${renderStemma(partita.casa, 'w-14 h-14 mb-2')}
                    <span class="font-bold text-sm text-center line-clamp-1">${partita.casa.nome}</span>
                </div>
                <div class="w-2/12 flex justify-center"><span class="text-muted text-sm font-bold px-3 py-1 bg-black/20 rounded-lg">VS</span></div>
                <div class="flex flex-col items-center w-5/12">
                    ${renderStemma(partita.trasferta, 'w-14 h-14 mb-2')}
                    <span class="font-bold text-sm text-center line-clamp-1">${partita.trasferta.nome}</span>
                </div>
            </div>
            ${eloBar}
            ${odds}
        </div>
    `;
}

// --- STREAMING_CHUNK:Carousel Logic... ---
function initCarousel(id, count) {
    if(count <= 1) return;
    const track = document.getElementById(`track-${id}`);
    const progress = document.getElementById(`progress-${id}`);
    const dotsContainer = document.getElementById(`dots-${id}`);
    const duration = 10000; // 10 sec
    const fps = 60;
    const step = 100 / (duration / (1000/fps));
    
    let currentIndex = 0;
    let currentProgress = 0;
    let isPaused = false;

    // Crea pallini
    const riduciMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    dotsContainer.innerHTML = Array(count).fill(0).map((_, i) => 
        `<button class="w-2 h-2 rounded-full cursor-pointer transition-colors ${i===0 ? 'bg-accent' : 'bg-white/20'}" data-idx="${i}" aria-label="Partita ${i + 1} di ${count}"></button>`
    ).join('');

    const updateDots = () => {
        Array.from(dotsContainer.children).forEach((dot, i) => {
            dot.className = `w-2 h-2 rounded-full cursor-pointer transition-colors ${i===currentIndex ? 'bg-accent' : 'bg-white/20'}`;
            dot.setAttribute('aria-current', i === currentIndex ? 'true' : 'false');
        });
    };

    const goToSlide = (index) => {
        currentIndex = index;
        track.scrollTo({ left: currentIndex * track.offsetWidth, behavior: riduciMovimento ? 'auto' : 'smooth' });
        progress.style.width = '0%';
        currentProgress = 0;
        updateDots();
    };

    // Eventi pallini
    Array.from(dotsContainer.children).forEach(dot => {
        dot.addEventListener('click', (e) => {
            goToSlide(parseInt(e.target.dataset.idx));
        });
    });

    // Frecce avanti/indietro
    document.querySelectorAll(`.car-nav[data-car="${id}"]`).forEach(b => b.addEventListener('click', () => {
        goToSlide((currentIndex + parseInt(b.dataset.dir) + count) % count);
    }));
    // Scorrimento con il dito: allinea la partita mostrata
    let attesaScroll;
    track.addEventListener('scroll', () => {
        clearTimeout(attesaScroll);
        attesaScroll = setTimeout(() => {
            const idx = Math.round(track.scrollLeft / track.offsetWidth);
            if (idx !== currentIndex) { currentIndex = idx; currentProgress = 0; updateDots(); }
        }, 150);
    }, { passive: true });

    // Pausa su hover/touch
    const container = document.getElementById(`carousel-${id}`);
    container.addEventListener('mouseenter', () => isPaused = true);
    container.addEventListener('mouseleave', () => isPaused = false);
    container.addEventListener('touchstart', () => isPaused = true, {passive: true});
    container.addEventListener('touchend', () => isPaused = false, {passive: true});
    container.addEventListener('focusin', () => isPaused = true);
    container.addEventListener('focusout', () => isPaused = false);

    if (riduciMovimento) return; // con "riduci animazioni" il carosello si sfoglia solo a mano
    State.carouselTimers[id] = setInterval(() => {
        if(!isPaused) {
            currentProgress += step;
            progress.style.width = `${currentProgress}%`;
            
            if(currentProgress >= 100) {
                currentProgress = 0;
                currentIndex = (currentIndex + 1) % count;
                goToSlide(currentIndex);
            }
        }
    }, 1000/fps);

    // Resetta scroll su resize
    window.addEventListener('resize', () => goToSlide(currentIndex));
}

// --- STREAMING_CHUNK:View - Classifiche... ---
function renderClassifiche(container) {
    const comps = State.data?.competizioni;
    if(!comps) { container.innerHTML = 'Nessun dato'; return; }

    // Selettore (Tabs)
    const compNames = Object.keys(comps);
    let activeComp = (State.compAttiva && comps[State.compAttiva]) ? State.compAttiva : compNames[0];

    const renderCompTab = () => {
        const comp = comps[activeComp];
        if(!comp || !comp.fasi) return '<div class="p-8 text-center">Nessuna fase definita.</div>';
        
        return comp.fasi.map(fase => {
            if(fase.stato === 'da_iniziare') {
                return `
                    <div class="surface rounded-2xl border border-theme p-8 text-center mb-6">
                        <h3 class="text-xl font-bold mb-2">${fase.nome}</h3>
                        <p class="text-muted">Fase non ancora iniziata</p>
                    </div>
                `;
            }
            
            if(fase.tipo === 'girone_italiana') return renderGirone(fase, activeComp);
            if(fase.tipo === 'eliminazione_AR') return renderEliminazione(fase);
            if(fase.tipo === 'finale_secca') return renderFinale(fase);
            if(fase.tipo === 'formula1') return renderFormula1(fase);
            return '';
        }).join('');
    };

    const html = `
        <div class="flex gap-2 overflow-x-auto hide-scrollbar mb-6 pb-2" id="comp-tabs">
            ${compNames.map(name => `
                <button class="comp-tab whitespace-nowrap px-6 py-2 rounded-full text-sm font-bold border transition-colors ${name === activeComp ? 'bg-accent border-accent' : 'surface border-theme text-muted hover:bg-white/5'}" data-comp="${name}">
                    ${name}
                </button>
            `).join('')}
        </div>
        <div id="comp-content">
            ${renderCompTab()}
        </div>
    `;
    
    container.innerHTML = html;

    // Event listener tabs
    document.querySelectorAll('.comp-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            State.compAttiva = e.currentTarget.dataset.comp;
            // Rerender intera vista per semplicità (aggiorna bottoni e contenuto)
            renderClassifiche(container);
        });
    });
}

function renderGirone(fase, compName) {
    const tableRows = (fase.classifica || []).map(r => {
        const penBadge = r.pen !== 0 ? `<span class="bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded ml-1" title="Penalità: ${r.pen} pt"> ${r.pen}</span>` : '';

        return `
            <tr class="border-b border-theme hover:bg-white/5 transition-colors">
                <td class="px-1 py-3 sm:p-3 text-center font-bold text-sm text-muted w-10">${r.pos}</td>
                <td class="px-1 py-3 sm:p-3 font-semibold">
                    <div class="flex items-center gap-2 sm:gap-3">
                        ${renderStemma(r.squadra, 'w-6 h-6 sm:w-8 sm:h-8')}
                        <span class="truncate max-w-[92px] sm:max-w-xs text-sm sm:text-base">${r.squadra.nome}</span>
                    </div>
                </td>
                <td class="px-1 py-3 sm:p-3 text-center font-black text-lg flex items-center justify-center">${r.pt}${penBadge}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell">${r.g}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell text-accent">${r.v}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell text-muted">${r.n}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell text-danger">${r.p}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden md:table-cell">${r.gf}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden md:table-cell">${r.gs}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm font-mono ${getColorClass(r.dr)}">${r.dr > 0 ? '+'+r.dr : r.dr}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm font-mono">${formatNumber(r.fp)}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm text-muted hidden lg:table-cell">${formatNumber(r.fm, 2)}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="surface rounded-2xl border border-theme overflow-hidden mb-6 flex flex-col">
            <div class="p-4 border-b border-theme bg-black/20">
                <h3 class="font-bold text-lg">${fase.nome}</h3>
            </div>
            <div class="overflow-x-auto custom-scrollbar w-full">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-xs uppercase tracking-wider text-muted border-b border-theme bg-black/10">
                            <th class="px-1 py-3 sm:p-3 text-center font-medium">Pos</th>
                            <th class="px-1 py-3 sm:p-3 font-medium">Squadra</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-bold text-main">Pt</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium hidden sm:table-cell">G</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium hidden sm:table-cell">V</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium hidden sm:table-cell">N</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium hidden sm:table-cell">P</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium hidden md:table-cell" title="Gol Fatti">GF</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium hidden md:table-cell" title="Gol Subiti">GS</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium" title="Differenza Reti">DR</th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium"><span class="sm:hidden">FP</span><span class="hidden sm:inline">Fantapunti</span></th>
                            <th class="px-1 py-3 sm:p-3 text-center font-medium hidden lg:table-cell">Media</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderEliminazione(fase) {
    const sfide = (fase.sfide || []).map(sfida => {
        const s1 = sfida.squadre[0];
        const s2 = sfida.squadre[1];
        const p1 = sfida.passa === s1.nome;
        const p2 = sfida.passa === s2.nome;

        return `
            <div class="surface p-4 rounded-xl border border-theme flex flex-col sm:flex-row gap-4 justify-between">
                <!-- Totale / Vincitore (Mobile Top, Desktop Left) -->
                <div class="flex sm:flex-col justify-center gap-2 sm:w-1/3">
                    <div class="flex items-center gap-2 ${p1 ? 'font-bold text-accent' : (sfida.finita && !p1 ? 'text-muted opacity-50' : '')}">
                        ${renderStemma(s1, 'w-6 h-6')}
                        <span class="truncate">${s1.nome}</span>
                        <span class="ml-auto font-mono bg-black/20 px-2 rounded">${sfida.totale?.[s1.nome]?.gol ?? '-'}</span>
                    </div>
                    <div class="flex items-center gap-2 ${p2 ? 'font-bold text-accent' : (sfida.finita && !p2 ? 'text-muted opacity-50' : '')}">
                        ${renderStemma(s2, 'w-6 h-6')}
                        <span class="truncate">${s2.nome}</span>
                        <span class="ml-auto font-mono bg-black/20 px-2 rounded">${sfida.totale?.[s2.nome]?.gol ?? '-'}</span>
                    </div>
                </div>

                <!-- Dettaglio Gare -->
                <div class="flex flex-col gap-2 text-xs text-muted sm:w-2/3 border-t sm:border-t-0 sm:border-l border-theme pt-3 sm:pt-0 sm:pl-4">
                    ${sfida.gare.map(g => `
                        <div class="flex justify-between items-center bg-white/5 p-2 rounded">
                            <span class="w-12">G. ${g.giornata}</span>
                            <span class="flex-1 truncate text-right mr-2 ${g.casa === sfida.passa ? 'text-main font-semibold' : ''}">${g.casa}</span>
                            <span class="font-mono bg-black/20 px-1 rounded text-main">${g.gol[0]}-${g.gol[1]}</span>
                            <span class="flex-1 truncate ml-2 ${g.trasferta === sfida.passa ? 'text-main font-semibold' : ''}">${g.trasferta}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="mb-6">
            <h3 class="font-bold text-lg mb-4 px-2 border-l-2 border-accent">${fase.nome}</h3>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                ${sfide || '<p class="text-muted p-4">Nessuna sfida definita</p>'}
            </div>
        </div>
    `;
}

function renderFinale(fase) {
    const schede = (fase.partite || []).map(p => {
        const vinc = p.vincitore;
        const riga = (sq, gol) => `
            <div class="flex items-center gap-3 ${vinc && vinc === sq.nome ? 'font-bold text-accent' : (vinc ? 'text-muted' : '')}">
                ${renderStemma(sq, 'w-10 h-10')}
                <span class="flex-1 truncate">${sq.nome}</span>
                <span class="font-mono text-xl">${p.giocata ? gol : '-'}</span>
            </div>`;
        return `
            <div class="surface p-5 rounded-2xl border border-theme flex flex-col gap-3 max-w-md">
                ${riga(p.casa, p.gol[0])}
                ${riga(p.trasferta, p.gol[1])}
                ${p.supplementari ? '<div class="text-xs text-muted">Decisa ai tempi supplementari</div>' : ''}
                ${vinc ? `<div class="text-sm font-bold">🏆 Vince ${vinc}</div>` : '<div class="text-sm text-muted">Da giocare</div>'}
            </div>`;
    }).join('');
    return `
        <div class="mb-6">
            <h3 class="font-bold text-lg mb-4 px-2 border-l-2 border-accent">${fase.nome}</h3>
            ${schede || '<p class="text-muted p-4">Finalisti non ancora definiti</p>'}
        </div>`;
}

function renderFormula1(fase) {
    const righe = (fase.classifica || []).map(r => `
        <tr class="border-b border-theme hover:bg-white/5 transition-colors">
            <td class="p-3 text-center font-bold text-sm text-muted w-10">${r.pos}</td>
            <td class="p-3 font-semibold"><div class="flex items-center gap-3">${renderStemma(r.squadra, 'w-8 h-8')}<span class="truncate max-w-[140px] sm:max-w-xs">${r.squadra.nome}</span></div></td>
            <td class="p-3 text-center text-sm text-muted">${r.giornate}</td>
            <td class="p-3 text-center font-black text-lg">${formatNumber(r.pf1, 0)}</td>
            <td class="p-3 text-center text-sm font-mono">${formatNumber(r.fp)}</td>
        </tr>`).join('');
    return `
        <div class="surface rounded-2xl border border-theme overflow-hidden mb-6">
            <div class="p-4 border-b border-theme bg-black/20"><h3 class="font-bold text-lg">${fase.nome}</h3></div>
            <div class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-left border-collapse">
                    <thead><tr class="text-xs uppercase tracking-wider text-muted border-b border-theme bg-black/10">
                        <th class="p-3 text-center">Pos</th><th class="p-3">Squadra</th><th class="p-3 text-center">Giornate</th>
                        <th class="p-3 text-center text-main">Punti F1</th><th class="p-3 text-center">Fantapunti</th></tr></thead>
                    <tbody>${righe}</tbody>
                </table>
            </div>
        </div>`;
}

// --- STREAMING_CHUNK:View - Elo & Chart... ---
function renderElo(container) {
    const classData = State.data?.elo?.classifica || [];
    
    const tableRows = classData.map((r, i) => {
        const forma = r.forma ?? r.variazione; // variazione delle ultime 5 giornate
        const isPos = forma > 0;
        const isNeg = forma < 0;
        const varColor = isPos ? 'text-accent' : (isNeg ? 'text-danger' : 'text-muted');
        const sign = isPos ? '▲ +' : (isNeg ? '▼ ' : '');
        
        return `
            <tr class="border-b border-theme hover:bg-white/5 transition-colors">
                <td class="py-3 px-2 text-center text-muted w-8">${i + 1}</td>
                <td class="py-3 px-2 font-semibold">
                    <div class="flex items-center gap-2 min-w-0">
                        ${renderStemma(r.squadra, 'w-7 h-7')}
                        <span class="truncate max-w-[110px] sm:max-w-[130px]">${r.squadra.nome}</span>
                    </div>
                </td>
                <td class="py-3 px-2 text-center font-bold font-mono text-base">${r.rating.toFixed(0)}</td>
                <td class="py-3 px-2 text-right font-mono text-xs whitespace-nowrap ${varColor}">${sign}${formatNumber(forma, 0)}</td>
                <td class="py-3 px-2 text-center text-sm hidden sm:table-cell text-muted">${r.partite}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <div class="flex flex-col gap-6">
            <div class="surface p-4 rounded-2xl border border-theme h-[420px] flex flex-col relative">
                <h3 class="font-bold mb-4">Andamento Stagionale</h3>
                <div class="flex-1 relative w-full h-full">
                    <canvas id="eloChart"></canvas>
                </div>
            </div>
            
            <div class="surface rounded-2xl border border-theme overflow-hidden">
                <div>
                    <table class="w-full text-left border-collapse">
                        <thead class="border-b border-theme bg-black/10">
                            <tr class="text-xs uppercase tracking-wider text-muted">
                                <th class="py-3 px-2 text-center">#</th>
                                <th class="py-3 px-2">Squadra</th>
                                <th class="py-3 px-2 text-center">Elo</th>
                                <th class="py-3 px-2 text-right" title="Variazione dell'Elo nelle ultime 5 giornate">Forma</th>
                                <th class="py-3 px-2 text-center hidden sm:table-cell">G</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;

    setTimeout(renderEloChart, 50); // Attendi rendering DOM
}

function renderEloChart() {
    const canvas = document.getElementById('eloChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const storia = State.data?.elo?.storia || [];
    if(storia.length === 0) return;

    const prima = State.data?.lega?.prima_giornata || 1; // asse in giornate di Lega (1ª di Lega = prima_giornata di Serie A)
    const labels = storia.map(s => s.giornata === null ? 'Inizio' : `${s.giornata - prima + 1}ª`);
    const squadre = Object.keys(storia[0].rating);
    
    // Definisci i colori base per il tema corrente
    const textColor = State.theme === 'dark' ? '#9ca3af' : '#6b7280';
    const gridColor = State.theme === 'dark' ? '#333633' : '#e5e7eb';
    
    // Trova le top 2 per evidenziarle
    const top2 = State.data?.elo?.classifica?.slice(0,2).map(r => r.squadra.nome) || [];

    const datasets = squadre.map(sq => {
        const isHighlight = top2.includes(sq);
        // Cerca colore reale dal JSON
        const sqData = State.data.squadre.find(s => s.nome === sq);
        let color = sqData ? sqData.colore : '#ffffff';
        
        return {
            label: sq,
            data: storia.map(s => s.rating[sq]),
            borderColor: color,
            backgroundColor: color,
            borderWidth: isHighlight ? 3 : 2,
            tension: 0.3,
            pointRadius: isHighlight ? 4 : 0,
            pointHoverRadius: 6,
            order: isHighlight ? 0 : 1
        };
    });

    // Linea base 1500
    datasets.push({
        label: 'Media (1500)',
        data: Array(labels.length).fill(1500),
        borderColor: State.theme === 'dark' ? '#ffffff30' : '#00000030',
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderDash: [2, 4],
        fill: false,
        tension: 0
    });

    if(State.chartInstance) State.chartInstance.destroy();

    State.chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { 
                        color: textColor,
                        usePointStyle: true,
                        boxWidth: 6,
                        font: { size: 10, family: 'Inter' },
                        filter: function(item) { return item.text !== 'Media (1500)'; }
                    },
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.datasetIndex;
                        const ci = legend.chart;
                        const meta = ci.getDatasetMeta(index);
                        // Toggle visibility
                        meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
                        ci.update();
                    }
                },
                tooltip: {
                    backgroundColor: State.theme === 'dark' ? 'rgba(34, 36, 34, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    titleColor: State.theme === 'dark' ? '#fff' : '#000',
                    bodyColor: State.theme === 'dark' ? '#fff' : '#000',
                    borderColor: gridColor,
                    borderWidth: 1,
                    padding: 10,
                    bodyFont: { family: 'Inter', size: 12 },
                    titleFont: { family: 'Inter', size: 13, weight: 'bold' },
                    callbacks: { title: items => items[0].label === 'Inizio' ? 'Inizio stagione' : `${items[0].label} giornata di Lega` }
                }
            },
            scales: {
                x: { grid: { color: gridColor, drawBorder: false }, ticks: { color: textColor, font: {family: 'Inter'} } },
                y: { 
                    grid: { color: gridColor, drawBorder: false }, 
                    ticks: { color: textColor, font: {family: 'Inter'} },
                    // Adatta scala
                    suggestedMin: 1350, suggestedMax: 1650
                }
            }
        }
    });
}

// --- STREAMING_CHUNK:View - Ranking Allenatori... ---
function renderRanking(container) {
    const d = State.data?.ranking_allenatori;
    if(!d) { container.innerHTML = 'Nessun dato'; return; }

    const renderTable = (data, valueKey, valueLabel, isFloat = false) => `
        <table class="w-full text-left border-collapse">
            <thead class="bg-black/10 border-b border-theme">
                <tr class="text-xs uppercase tracking-wider text-muted">
                    <th class="p-3 text-center w-12">Pos</th>
                    <th class="p-3">Allenatore</th>
                    <th class="p-3 text-center">${valueLabel}</th>
                    <th class="p-3 text-center hidden sm:table-cell">Stag.</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(r => `
                    <tr class="border-b border-theme hover:bg-white/5 transition-colors">
                        <td class="p-3 text-center text-muted font-mono">${r.pos}</td>
                        <td class="p-3 font-bold">${r.allenatore}</td>
                        <td class="p-3 text-center font-mono text-accent font-bold">${isFloat ? r[valueKey].toFixed(2) : r[valueKey]}</td>
                        <td class="p-3 text-center hidden sm:table-cell text-muted">${r.stagioni}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="surface rounded-2xl border border-theme overflow-hidden flex flex-col">
                <div class="p-4 border-b border-theme bg-black/20"><h3 class="font-bold">Storico Assoluto</h3></div>
                <div>
                    ${renderTable(d.storico, 'punti', 'Punti')}
                </div>
            </div>
            <div class="surface rounded-2xl border border-theme overflow-hidden flex flex-col">
                <div class="p-4 border-b border-theme bg-black/20"><h3 class="font-bold">Standardizzato (Media)</h3></div>
                <div>
                    ${renderTable(d.standardizzato, 'punti', 'Pt/Stag', true)}
                </div>
            </div>
            <div class="surface rounded-2xl border border-theme overflow-hidden flex flex-col">
                <div class="p-4 border-b border-theme bg-black/20"><h3 class="font-bold">Ultime 5 Stagioni</h3></div>
                <div>
                    ${renderTable(d.ultime5_classifica, 'punti', 'Punti')}
                </div>
            </div>
        </div>
    `;
}

// --- STREAMING_CHUNK:View - Mercato & Montepremi... ---
function raggruppaOperazioni(ops) {
    // le righe con lo stesso id_operazione formano un'unica operazione (es. uno scambio con più giocatori)
    const gruppi = {};
    ops.forEach((op, i) => { const k = op.id_operazione ?? `riga-${i}`; (gruppi[k] ||= []).push(op); });
    return Object.values(gruppi).sort((a, b) => String(b[0].data || '').localeCompare(String(a[0].data || '')));
}

function renderOperazione(righe) {
    const o = righe[0];
    const squadre = [...new Set(righe.flatMap(r => [r.da_squadra, r.a_squadra]).filter(Boolean))];
    const titolo = (o.tipo === 'scambio' && squadre.length === 2) ? `${squadre[0]} ⇄ ${squadre[1]}` : ((o.tipo || 'operazione').charAt(0).toUpperCase() + (o.tipo || 'operazione').slice(1).replace('_', ' '));
    return `
        <div class="surface p-4 rounded-xl border border-theme">
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-sm">${titolo}</span>
                <span class="text-xs text-muted">${o.data ? formatDate(String(o.data).slice(0, 10)) : (o.giornata ? 'G. ' + o.giornata : '')}</span>
            </div>
            ${righe.map(r => `<div class="py-1.5 border-t border-theme first:border-t-0"><div class="text-sm">${r.ruolo ? `<span class="inline-block w-5 font-bold text-muted">${r.ruolo}</span>` : ''}${r.giocatore || ''}</div><div class="text-xs text-muted ${r.ruolo ? 'pl-5' : ''}">${r.da_squadra || 'svincolati'} → ${r.a_squadra || 'svincolati'}${r.crediti ? ` · ${r.crediti} crediti` : ''}</div></div>`).join('')}
        </div>`;
}

function renderMercato(container) {
    const m = State.data?.mercato;
    if(!m) { container.innerHTML = 'Nessun dato'; return; }

    const bannerClass = m.aperto ? 'bg-accent/10 border-accent/50 text-accent' : 'bg-white/5 border-theme text-muted';
    const bannerText = m.aperto 
        ? `⚽ Mercato APERTO fino al ${formatDate(m.finestra_aperta.fino_al)}`
        : (m.prossima_finestra ? `🔒 Mercato CHIUSO &middot; Prossima finestra: ${m.prossima_finestra.descrizione} (${formatDate(m.prossima_finestra.dal)}${m.prossima_finestra.al ? ' - ' + formatDate(m.prossima_finestra.al) : ''})` : '🔒 Mercato CHIUSO');

    container.innerHTML = `
        <div class="p-4 rounded-xl border ${bannerClass} text-center font-medium mb-6">
            ${bannerText}
        </div>
        
        <h3 class="font-bold text-lg mb-4">Ultime Operazioni</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${m.operazioni.length > 0 
                ? raggruppaOperazioni(m.operazioni).map(renderOperazione).join('')
                : `<div class="col-span-full text-center p-8 surface rounded-xl border border-theme border-dashed text-muted">Nessuna operazione registrata in questa finestra.</div>`
            }
        </div>
    `;
}

// --- STREAMING_CHUNK:Bootstrapping... ---
document.addEventListener('DOMContentLoaded', initApp);

    
