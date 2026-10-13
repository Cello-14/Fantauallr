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
    
    initSupabase();
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

function apriSquadra(nome) {
    if(State.view !== 'squadra') State.vistaPrecedente = State.view;
    State.squadraSel = nome;
    State.view = 'squadra';
    document.querySelectorAll('.nav-btn').forEach(b => { b.classList.remove('bg-white/10', 'text-main'); b.classList.add('text-muted'); });
    renderView();
    window.scrollTo({ top: 0 });
}

function bindEvents() {
    // qualsiasi elemento con data-squadra apre la scheda di quella squadra
    document.getElementById('view-container').addEventListener('click', e => {
        const el = e.target.closest('[data-squadra]');
        if(el && !e.target.closest('button.esito-btn, input, form')) apriSquadra(el.dataset.squadra);
    });
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
    document.getElementById('league-season').innerText = `Stagione ${State.data.lega.stagione}` + (State.data.ultima_giornata?.giornata ? ` • Giornata ${gLega(State.data.ultima_giornata.giornata)}` : '');
    
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
            subtitle.innerText = State.data.ultima_giornata?.giornata ? `Riepilogo Giornata ${gLega(State.data.ultima_giornata.giornata)}` : 'La stagione sta per iniziare';
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
        case 'calendario':
            title.innerText = 'Calendario';
            subtitle.innerText = 'Tutte le giornate di tutte le competizioni';
            renderCalendario(container);
            break;
        case 'statistiche':
            title.innerText = 'Statistiche';
            subtitle.innerText = 'Record, serie e Culometro';
            renderStatistiche(container);
            break;
        case 'squadra':
            title.innerText = State.squadraSel || 'Squadra';
            subtitle.innerText = 'Scheda della squadra';
            renderSquadra(container);
            break;
        case 'mercato':
            title.innerText = 'Mercato';
            subtitle.innerText = 'Stato e ultime operazioni';
            renderMercato(container);
            break;
        case 'previsioni':
            if(State.data?.previsioni_stagione) {
                title.innerText = 'Previsioni';
                subtitle.innerText = 'Probabilità di fine stagione';
                renderPrevisioni(container);
                break;
            }
            // senza simulazione: messaggio come le altre sezioni in arrivo
        case 'quote':
            if(State.view === 'quote' && State.data?.quote?.partite?.length) {
                title.innerText = 'Quote';
                subtitle.innerText = `Giornata ${gLega(State.data.quote.giornata)}`;
                renderQuote(container);
                break;
            }
        case 'scommettitori':
            if(State.view === 'scommettitori' && Bet.sb) {
                title.innerText = 'Classifica Scommettitori';
                subtitle.innerText = 'Chi scommette meglio';
                renderScommettitori(container);
                break;
            }
        // eslint-disable-next-line no-fallthrough
        case 'segnaposto': {
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

// --- Scommesse (fase 4): database Supabase. La chiave è PUBBLICA: la sicurezza sta nelle regole del database
// (solo i membri della lega, solo le proprie scommesse, 100 crediti a giornata, chiusura all'inizio della giornata).
const SUPABASE_URL = 'https://gfpkptpmnlnzaarrrczf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4Nk7dNnqpVI0mJB6cC3Dtg_Z_3Gn0e2';
const Bet = { sb: null, sessione: null, profilo: null, schedina: {}, quoteDb: null, messaggio: null, mie: [] };

function initSupabase() {
    try {
        if(!window.supabase?.createClient) return;
        Bet.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        Bet.sb.auth.onAuthStateChange((evento, sessione) => {
            Bet.sessione = sessione;
            Bet.profilo = null;
            if(['quote', 'scommettitori'].includes(State.view)) renderView();
        });
    } catch(e) { console.error('Supabase non disponibile', e); Bet.sb = null; }
}

const idPartita = (p, Q) => `${State.data.lega.stagione}|${Q.giornata}|${p.fase}|${p.casa.nome}|${p.trasferta.nome}`;
const fmtQuota = q => (q === null || q === undefined) ? '–' : Number(q).toFixed(2).replace('.', ',');
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// riquadro accesso / profilo, usato da Quote e Classifica Scommettitori
function bloccoAccesso() {
    if(!Bet.sb) return '';
    if(!Bet.sessione) return `
        <form id="form-accesso" class="surface rounded-2xl border border-theme p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:items-center">
            <span class="text-sm flex-1"><b>Accedi per scommettere</b> <span class="text-muted">· riceverai un link via email, nessuna password</span></span>
            <input id="email-accesso" type="email" required placeholder="la tua email" class="surface border border-theme rounded-lg px-3 py-2 text-sm min-w-0 sm:w-64">
            <button class="bg-accent text-black font-bold rounded-lg px-4 py-2 text-sm">Ricevi il link</button>
        </form>`;
    const p = Bet.profilo;
    return `
        <div class="surface rounded-2xl border border-theme p-4 mb-6 flex flex-wrap gap-x-6 gap-y-2 items-center text-sm">
            <span>${p ? `Ciao <b>${esc(p.soprannome)}</b>` : (p === false ? '<span class="text-danger">La tua email non è nella lista dei membri della lega</span>' : 'Accesso in corso…')}</span>
            ${p ? `<span><span class="text-muted">Crediti di questa giornata:</span> <b>${p.crediti_residui}</b> / 100</span>` : ''}
            <button id="esci" class="ml-auto text-muted hover:text-main underline">Esci</button>
        </div>`;
}

function collegaAccesso(container) {
    container.querySelector('#form-accesso')?.addEventListener('submit', async ev => {
        ev.preventDefault();
        const email = container.querySelector('#email-accesso').value.trim().toLowerCase();
        const { error } = await Bet.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
        Bet.messaggio = error ? { ok: false, testo: 'Invio non riuscito: ' + error.message } : { ok: true, testo: `Link inviato a ${email}: aprilo da questo dispositivo.` };
        renderView();
    });
    container.querySelector('#esci')?.addEventListener('click', async () => { await Bet.sb.auth.signOut(); Bet.schedina = {}; renderView(); });
}

const bloccoMessaggio = () => Bet.messaggio
    ? `<div class="rounded-xl p-3 mb-4 text-sm border ${Bet.messaggio.ok ? 'border-accent text-accent' : 'border-danger text-danger'}">${esc(Bet.messaggio.testo)}</div>` : '';

async function caricaProfilo(Q) {
    if(!Bet.sb || !Bet.sessione) return;
    const { data, error } = await Bet.sb.rpc('mio_profilo', { p_stagione: State.data.lega.stagione, p_giornata: Q.giornata });
    Bet.profilo = (!error && data?.length) ? data[0] : false;
    const r = await Bet.sb.from('scommesse').select('id, giornata, importo, quota, stato, vincita, creata, selezioni(partita_id, esito, quota)')
        .eq('stagione', State.data.lega.stagione).order('creata', { ascending: false }).limit(30);
    Bet.mie = r.data || [];
}

// --- Quote della prossima giornata: quote dal database (si muovono con le puntate) o, senza database, dal sito
async function renderQuote(container) {
    const Q = State.data.quote;
    if(Bet.sb) {
        const r = await Bet.sb.rpc('quote_giornata', { p_stagione: State.data.lega.stagione, p_giornata: Q.giornata });
        Bet.quoteDb = (!r.error && r.data?.length) ? Object.fromEntries(r.data.map(x => [x.partita_id, x])) : null;
        await caricaProfilo(Q);
    }
    if(State.view !== 'quote') return;
    const puoi = !!(Bet.profilo && Bet.quoteDb);
    const box = (p, esito, quota, prob, aperta) => {
        const id = idPartita(p, Q), scelto = Bet.schedina[id]?.esito === esito;
        const attivo = puoi && aperta && quota;
        return `
        <button ${attivo ? '' : 'disabled'} data-partita="${esc(id)}" data-esito="${esito}" data-quota="${quota}"
            class="esito-btn flex-1 border rounded-xl py-2 flex flex-col items-center transition-colors ${scelto ? 'bg-accent text-black border-accent' : 'surface border-theme'} ${attivo ? 'hover:border-accent cursor-pointer' : 'cursor-not-allowed'}">
            <span class="text-[11px] ${scelto ? '' : 'text-muted'}">${esito}</span>
            <span class="text-lg font-black">${fmtQuota(quota)}</span>
            <span class="text-[10px] ${scelto ? '' : 'text-muted'}">${prob !== undefined ? Math.round(prob * 100) + '%' : ''}</span>
        </button>`;
    };
    const card = p => {
        const pr = p.probabilita || {}, db = Bet.quoteDb?.[idPartita(p, Q)];
        const q = db ? { '1': db.q1, 'X': db.qx, '2': db.q2 } : p.quote;
        const aperta = db ? db.aperta : true;
        const esiti = p.finale ? [['1', pr.passa_1], ['2', pr.passa_2]] : [['1', pr['1']], ['X', pr['X']], ['2', pr['2']]];
        return `
        <div class="surface rounded-2xl border border-theme p-4 flex flex-col gap-3">
            <div class="flex justify-between items-center">
                <span class="bg-white/10 text-xs px-3 py-1 rounded-full font-semibold border border-theme">${p.competizione === 'Campionato' ? 'Campionato' : p.fase}</span>
                ${!aperta ? '<span class="text-[11px] text-danger">chiusa</span>' : p.finale ? '<span class="text-[11px] text-muted">supplementari compresi</span>' : ''}
            </div>
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 w-1/2">${renderStemma(p.casa, 'w-8 h-8')}<span class="font-bold text-sm truncate" data-squadra="${esc(p.casa.nome)}">${p.casa.nome}</span></div>
                <div class="flex items-center gap-2 min-w-0 w-1/2 justify-end"><span class="font-bold text-sm truncate text-right" data-squadra="${esc(p.trasferta.nome)}">${p.trasferta.nome}</span>${renderStemma(p.trasferta, 'w-8 h-8')}</div>
            </div>
            <div class="flex gap-2">${esiti.map(([e, prob]) => box(p, e, q[e], prob, aperta)).join('')}</div>
        </div>`;
    };
    // schedina
    const sel = Object.entries(Bet.schedina);
    const quotaTot = sel.reduce((a, [, v]) => a * v.quota, 1);
    const schedina = !puoi ? '' : `
        <div class="surface rounded-2xl border ${sel.length ? 'border-accent' : 'border-theme'} p-4 mb-6">
            <h3 class="font-bold mb-2">Schedina ${sel.length > 1 ? '<span class="text-xs text-muted font-normal">· multipla: vinci solo se le indovini tutte</span>' : ''}</h3>
            ${sel.length ? `
                <ul class="text-sm mb-3 space-y-1">${sel.map(([id, v]) => `<li class="flex justify-between gap-2"><span class="truncate">${esc(v.nome)} · <b>${v.esito}</b></span><span class="font-mono">${fmtQuota(v.quota)}</span></li>`).join('')}</ul>
                <div class="flex flex-wrap items-center gap-3">
                    <span class="text-sm">Quota <b class="font-mono">${fmtQuota(quotaTot)}</b></span>
                    <input id="importo" type="number" min="1" max="${Bet.profilo.crediti_residui}" value="${Math.min(10, Bet.profilo.crediti_residui)}" class="surface border border-theme rounded-lg px-3 py-2 text-sm w-24">
                    <span class="text-sm text-muted">crediti → vincita <b id="vincita-pot" class="text-main font-mono">${fmtQuota(quotaTot * Math.min(10, Bet.profilo.crediti_residui))}</b></span>
                    <button id="scommetti" class="ml-auto bg-accent text-black font-bold rounded-lg px-4 py-2 text-sm" ${Bet.profilo.crediti_residui < 1 ? 'disabled' : ''}>Scommetti</button>
                    <button id="svuota" class="text-muted underline text-sm">Svuota</button>
                </div>` : '<p class="text-sm text-muted">Clicca una quota per aggiungerla. Più quote insieme formano una multipla (al massimo una per partita).</p>'}
        </div>`;
    const stato = { aperta: 'in attesa', vinta: 'vinta', persa: 'persa', annullata: 'annullata' };
    const mie = !(Bet.profilo && Bet.mie.length) ? '' : `
        <h3 class="font-bold text-lg mt-8 mb-3">Le mie scommesse</h3>
        <div class="flex flex-col gap-2">${Bet.mie.map(b => `
            <div class="surface rounded-xl border border-theme p-3 text-sm flex flex-wrap gap-x-4 gap-y-1 items-center">
                <span class="text-muted">G. ${gLega(b.giornata)}</span>
                <span class="flex-1 min-w-0 truncate">${b.selezioni.map(x => esc(x.partita_id.split('|').slice(3).join(' – ')) + ' <b>' + x.esito + '</b>').join(' · ')}</span>
                <span class="font-mono">${b.importo} × ${fmtQuota(b.quota)}</span>
                <span class="font-bold ${b.stato === 'vinta' ? 'text-accent' : b.stato === 'persa' ? 'text-danger' : 'text-muted'}">${stato[b.stato]}${b.stato === 'vinta' ? ' +' + fmtQuota(b.vincita) : ''}</span>
            </div>`).join('')}</div>`;
    container.innerHTML = `
        ${bloccoMessaggio()}${bloccoAccesso()}
        <div class="surface rounded-2xl border border-theme p-4 mb-6 text-sm flex flex-wrap gap-x-6 gap-y-1">
            <span><span class="text-muted">Chiusura:</span> <b>${Q.chiusura ? formatDate(Q.chiusura) : 'da definire'}</b> <span class="conto-rovescia text-accent text-xs"></span></span>
            <span class="text-muted">${puoi ? 'Le quote si muovono con le puntate: vale quella del momento in cui scommetti.' : Bet.sb ? 'Accedi con la tua email per scommettere con crediti virtuali.' : "Le scommesse con crediti virtuali si apriranno con l'accesso via email."}</span>
        </div>
        ${schedina}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${Q.partite.map(card).join('')}</div>
        ${mie}
        <p class="text-xs text-muted mt-4">Quote dal modello statistico sui fantapunti${Bet.quoteDb ? ' e dalle puntate dei membri' : ''}, con un margine del banco del ${Math.round(Q.margine * 100)}%. Sotto ogni quota la probabilità stimata dal modello. Si gioca solo con crediti virtuali: 100 per giornata, quelli non spesi si perdono.</p>`;
    collegaAccesso(container);
    if(Q.chiusura) avviaContoAllaRovescia(Q.chiusura);
    container.querySelectorAll('.esito-btn:not([disabled])').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.partita, nomi = id.split('|').slice(3).join(' – ');
        if(Bet.schedina[id]?.esito === b.dataset.esito) delete Bet.schedina[id];
        else Bet.schedina[id] = { esito: b.dataset.esito, quota: Number(b.dataset.quota), nome: nomi };
        Bet.messaggio = null;
        renderQuote(container);
    }));
    container.querySelector('#importo')?.addEventListener('input', e => {
        const v = Number(e.target.value) || 0;
        container.querySelector('#vincita-pot').textContent = fmtQuota(quotaTot * v);
    });
    container.querySelector('#svuota')?.addEventListener('click', () => { Bet.schedina = {}; renderQuote(container); });
    container.querySelector('#scommetti')?.addEventListener('click', async ev => {
        ev.target.disabled = true;
        const importo = parseInt(container.querySelector('#importo').value, 10);
        const selezioni = Object.entries(Bet.schedina).map(([partita_id, v]) => ({ partita_id, esito: v.esito }));
        const { error } = await Bet.sb.rpc('piazza_scommessa', { p_selezioni: selezioni, p_importo: importo });
        Bet.messaggio = error ? { ok: false, testo: error.message } : { ok: true, testo: 'Scommessa registrata!' };
        if(!error) Bet.schedina = {};
        renderQuote(container);
    });
}

// --- Classifica Scommettitori (dal database): stagione o di sempre
async function renderScommettitori(container) {
    const sempre = State.scommettitoriSempre === true;
    const { data, error } = await Bet.sb.rpc('classifica_scommettitori', { p_stagione: sempre ? null : State.data.lega.stagione });
    if(Bet.sessione && Bet.profilo === null && State.data.quote) await caricaProfilo(State.data.quote);
    if(State.view !== 'scommettitori') return;
    const righe = (data || []).map((r, i) => `
        <tr class="border-b border-theme">
            <td class="py-2 px-2 text-center text-muted">${i + 1}</td>
            <td class="py-2 px-2 font-semibold">${esc(r.soprannome)}</td>
            <td class="py-2 px-2 text-right font-mono font-bold ${r.netto > 0 ? 'text-accent' : r.netto < 0 ? 'text-danger' : ''}">${r.netto > 0 ? '+' : ''}${fmtQuota(r.netto)}</td>
            <td class="py-2 px-2 text-right font-mono">${r.rendimento > 0 ? '+' : ''}${String(r.rendimento).replace('.', ',')}%</td>
            <td class="py-2 px-2 text-center">${r.vinte}/${r.scommesse}</td>
            <td class="py-2 px-2 text-center hidden sm:table-cell font-mono">${fmtQuota(r.quota_max_vinta)}</td>
            <td class="py-2 px-2 text-center hidden sm:table-cell">${r.pronostici_indovinati}</td>
            <td class="py-2 px-2 text-center hidden sm:table-cell font-mono">${fmtQuota(r.multipla_piu_ricca)}</td>
        </tr>`).join('');
    container.innerHTML = `
        ${bloccoMessaggio()}${bloccoAccesso()}
        <div class="flex gap-2 mb-4">
            <button data-sempre="0" class="tab-scomm text-sm font-semibold px-4 py-1.5 rounded-full border border-theme ${!sempre ? 'bg-accent text-black' : 'text-muted'}">Stagione ${State.data.lega.stagione}</button>
            <button data-sempre="1" class="tab-scomm text-sm font-semibold px-4 py-1.5 rounded-full border border-theme ${sempre ? 'bg-accent text-black' : 'text-muted'}">Di sempre</button>
        </div>
        ${error ? `<div class="surface rounded-2xl border border-theme p-8 text-center text-muted">Classifica non disponibile al momento.</div>`
        : !righe ? `<div class="surface rounded-2xl border border-theme p-8 text-center text-muted">Ancora nessuna scommessa conclusa. La classifica comparirà dopo la prima giornata con scommesse.</div>`
        : `<div class="surface rounded-2xl border border-theme overflow-hidden">
            <table class="w-full text-sm border-collapse">
                <thead class="border-b border-theme bg-black/10 text-xs uppercase text-muted">
                    <tr><th class="py-2 px-2">#</th><th class="py-2 px-2 text-left">Giocatore</th><th class="py-2 px-2 text-right">Netto</th>
                    <th class="py-2 px-2 text-right" title="Guadagno ÷ crediti puntati">Rend.</th><th class="py-2 px-2" title="Scommesse vinte / giocate">Vinte</th>
                    <th class="py-2 px-2 hidden sm:table-cell">Quota max vinta</th><th class="py-2 px-2 hidden sm:table-cell" title="Pronostici indovinati, anche dentro le multiple">Pronostici</th>
                    <th class="py-2 px-2 hidden sm:table-cell">Multipla più ricca</th></tr>
                </thead><tbody>${righe}</tbody>
            </table></div>
            <p class="text-xs text-muted mt-3">Ordine per guadagno netto in crediti (vincite − crediti puntati) sulle scommesse concluse: chi salta una giornata resta a 0. Il rendimento mostra chi è bravo indipendentemente da quanto gioca.</p>`}`;
    collegaAccesso(container);
    container.querySelectorAll('.tab-scomm').forEach(b => b.addEventListener('click', () => { State.scommettitoriSempre = b.dataset.sempre === '1'; renderScommettitori(container); }));
}

// --- Previsioni: tabelle squadre × posizioni (ognuna solo quando una posizione è diventata impossibile) ---
function renderPrevisioni(container) {
    const V = State.data.previsioni_stagione;
    const visibili = (V.tabelle || []).filter(t => t.mostra);
    if(!visibili.length) {
        container.innerHTML = `
            <div class="surface rounded-2xl p-10 text-center flex flex-col items-center justify-center border border-theme">
                <span class="text-5xl mb-4 opacity-60">⏳</span>
                <h3 class="text-xl font-bold mb-2">Tutto ancora possibile</h3>
                <p class="text-muted max-w-md">Ogni squadra può ancora chiudere il Campionato, il girone di Champions e la Coppa Formula 1 in qualsiasi posizione. Ogni tabella con le probabilità comparirà quando, in quella competizione, almeno una posizione sarà diventata matematicamente impossibile per almeno una squadra.</p>
            </div>`;
        return;
    }
    container.innerHTML = visibili.map(t => tabellaPrevisioni(t)).join('') +
        `<p class="text-xs text-muted mt-3">Probabilità (%) da ${V.simulazioni.toLocaleString('it-IT')} stagioni simulate con il modello statistico sui fantapunti. Il punto (·) indica una posizione ormai matematicamente impossibile.${V.scala_f1_provvisoria ? ' Coppa: scala dei punti F1 provvisoria.' : ''}</p>`;
}

function tabellaPrevisioni(t) {
    const nomi = Object.keys(t.posizioni);
    const N = t.posizioni[nomi[0]].length;
    // ordine e punti: classifica attuale della fase se c'è, altrimenti posizione media prevista
    let ordine = null; const punti = {};
    try {
        for(const c of Object.values(State.data.competizioni)) {
            const f = c.fasi.find(x => x.nome === t.fase);
            if(f?.classifica) { ordine = f.classifica.map(r => r.squadra.nome).filter(n => nomi.includes(n)); f.classifica.forEach(r => punti[r.squadra.nome] = r.pt ?? r.pf1 ?? ''); }
        }
    } catch(e) {}
    if(!ordine || ordine.length !== nomi.length) {
        const media = n => t.posizioni[n].reduce((a, p, k) => a + p * (k + 1), 0);
        ordine = [...nomi].sort((a, b) => media(a) - media(b));
    }
    const scheda = nome => State.data.squadre.find(q => q.nome === nome) || { nome };
    const cella = (p, possibile) => {
        if(!possibile) return '<td class="text-center text-muted">·</td>';
        const v = p * 100;
        const txt = v === 0 ? '0' : v < 1 ? '<1' : v.toFixed(0);
        const alfa = Math.min(0.85, 0.08 + p * 1.6);
        return `<td class="text-center font-mono px-0 sm:px-1" style="background: rgba(190, 242, 100, ${alfa.toFixed(2)}); color: ${p > 0.3 ? '#111' : 'inherit'}">${txt}</td>`;
    };
    const extra = t.extra ? `<th class="py-2 px-0.5 sm:px-1 text-accent">${t.extra.etichetta.slice(0, 4)}<span class="hidden sm:inline">${t.extra.etichetta.slice(4)}</span></th>` : '';
    const righe = ordine.map((nome, i) => {
        const poss = t.possibili?.[nome] || Array.from({length: N}, (_, k) => k + 1);
        const ex = t.extra ? `<td class="py-2 px-0.5 sm:px-1 text-center font-bold text-accent">${Math.round((t.extra.valori[nome] || 0) * 100)}</td>` : '';
        return `<tr class="border-b border-theme">
            <td class="py-2 px-1 text-center text-muted hidden sm:table-cell">${i + 1}</td>
            <td class="py-2 px-0.5 sm:px-1"><div class="flex items-center gap-2 min-w-0" data-squadra="${esc(nome)}" title="${esc(nome)}">${renderStemma(scheda(nome), 'w-5 h-5 sm:w-6 sm:h-6')}<span class="hidden sm:inline truncate max-w-[130px] font-semibold">${nome}</span></div></td>
            <td class="py-2 px-0.5 sm:px-1 text-center font-bold">${punti[nome] ?? ''}</td>
            ${t.posizioni[nome].map((p, k) => cella(p, poss.includes(k + 1))).join('')}${ex}
        </tr>`;
    }).join('');
    return `
        <h2 class="font-bold text-xl mb-3 mt-6 first:mt-0">${t.titolo}</h2>
        <div class="surface rounded-2xl border border-theme overflow-hidden">
            <table class="w-full text-[10px] sm:text-sm border-collapse">
                <thead class="border-b border-theme bg-black/10 text-muted uppercase">
                    <tr><th class="py-2 px-1 hidden sm:table-cell">#</th><th class="py-2 px-0.5 sm:px-1 text-left"><span class="hidden sm:inline">Squadra</span></th><th class="py-2 px-0.5 sm:px-1">Pt</th>
                    ${Array.from({length: N}, (_, k) => `<th class="py-2 px-0 sm:px-1">${k + 1}<span class="hidden sm:inline">ª</span></th>`).join('')}${extra}</tr>
                </thead>
                <tbody>${righe}</tbody>
            </table>
        </div>`;
}

// --- STREAMING_CHUNK:View - Home (Carousels & Widgets)... ---
function renderHome(container) {
    const d = State.data;
    const uGiornata = d.ultima_giornata;
    const pGiornata = d.prossima_giornata;
    const turni = d.turni || [{ competizione: 'Campionato', ultimo: d.ultima_giornata, prossimo: d.prossima_giornata }];
    
    // Widgets
    let marketText = d.mercato?.prossima_finestra?.dal ? `Chiuso · riapre ${formatDate(d.mercato.prossima_finestra.dal)}` : "Chiuso";
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
                <span class="text-xs text-muted font-semibold uppercase tracking-wider mb-1">Scadenza formazioni${pGiornata?.giornata ? ' · G. ' + gLega(pGiornata.giornata) : ''}</span>
                <span class="font-bold text-sm leading-tight">${pGiornata?.scadenza_formazioni ? formatDate(pGiornata.scadenza_formazioni) + (pGiornata.scadenza_provvisoria ? ' (orario da definire)' : '') : 'Non ancora inserita'}</span>
                ${pGiornata?.scadenza_formazioni && !pGiornata.scadenza_provvisoria ? '<span class="conto-rovescia text-xs text-accent mt-1"></span>' : ''}
            </div>
        </div>

        <!-- Caroselli: una coppia (ultimi risultati / prossime sfide) per ogni competizione con partite -->
        ${turni.map((t, i) => `
            <h2 class="font-bold text-xl ${i > 0 ? 'mt-10' : ''} mb-4">${t.competizione}</h2>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                ${renderCarosello(i === 0 ? 'ultima' : 'ultima-' + i, 'Ultimi Risultati', t.ultimo, true, 'Nessuna partita giocata')}
                ${renderCarosello(i === 0 ? 'prossima' : 'prossima-' + i, 'Prossime Sfide', t.prossimo, false, 'Calendario non ancora disponibile')}
            </div>`).join('')}
    `;
    container.innerHTML = html;
    if(pGiornata?.scadenza_formazioni && !pGiornata.scadenza_provvisoria) avviaContoAllaRovescia(pGiornata.scadenza_formazioni);

    turni.forEach((t, i) => {
        if(t.ultimo?.partite?.length) initCarousel(i === 0 ? 'ultima' : 'ultima-' + i, t.ultimo.partite.length);
        if(t.prossimo?.partite?.length) initCarousel(i === 0 ? 'prossima' : 'prossima-' + i, t.prossimo.partite.length);
    });
}

// Giornata di Lega a partire da quella di Serie A (la 1ª di Lega è la prima_giornata di Serie A)
function gLega(g) {
    if(g === null || g === undefined || g === '') return g;
    return Number(g) - (State.data?.lega?.prima_giornata || 1) + 1;
}

function renderCarosello(id, titolo, turno, giocate, vuoto) {
    const partite = turno?.partite || [];
    return `
            <div class="surface rounded-3xl border border-theme overflow-hidden flex flex-col h-80 relative group" id="carousel-${id}">
                <div class="bg-black/20 p-4 border-b border-theme flex justify-between items-center z-10">
                    <h3 class="font-bold text-lg">${titolo} <span class="text-muted text-sm ml-2">G. ${turno?.giornata ? gLega(turno.giornata) : '-'}</span></h3>
                    ${partite.length > 1 ? `<div class="flex items-center gap-2"><button class="car-nav w-7 h-7 rounded-full border border-theme text-muted hover:text-main" data-car="${id}" data-dir="-1" aria-label="Partita precedente">‹</button><div class="flex gap-1" id="dots-${id}"></div><button class="car-nav w-7 h-7 rounded-full border border-theme text-muted hover:text-main" data-car="${id}" data-dir="1" aria-label="Partita successiva">›</button></div>` : ''}
                </div>
                <div class="carousel-track flex overflow-x-auto snap-x snap-mandatory hide-scrollbar flex-1 relative" id="track-${id}">
                    ${partite.map(p => giocate ? renderMatchCardLast(p) : renderMatchCardNext(p)).join('') || `<div class="w-full flex items-center justify-center text-muted">${vuoto}</div>`}
                </div>
                <div class="h-1 bg-white/10 w-full absolute bottom-0 z-20">
                    <div class="h-full bg-accent w-0 transition-all duration-100 ease-linear" id="progress-${id}"></div>
                </div>
            </div>`;
}

function renderMatchCardLast(partita) {
    const vCasa = partita.gol[0] > partita.gol[1];
    const vTras = partita.gol[1] > partita.gol[0];
    const dts = partita.supplementari_vinti_da ? `<div class="text-xs text-accent mt-2 text-center">d.t.s. vinti da ${partita.supplementari_vinti_da}</div>` : '';

    return `
        <div class="min-w-full w-full flex-shrink-0 snap-center flex flex-col items-center justify-center p-6 relative">
            <span class="absolute top-4 bg-white/10 text-xs px-3 py-1 rounded-full font-semibold border border-theme">${partita.competizione === "Campionato" ? "Campionato" : (partita.fase || partita.competizione)}</span>
            
            <div class="flex items-center justify-between w-full max-w-sm mt-4">
                <!-- Casa -->
                <div class="flex flex-col items-center w-1/3">
                    ${renderStemma(partita.casa, 'w-16 h-16 mb-2')}
                    <span class="font-bold text-sm text-center line-clamp-1 ${vCasa ? 'text-accent' : ''}" data-squadra="${esc(partita.casa.nome)}">${partita.casa.nome}</span>
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
                    <span class="font-bold text-sm text-center line-clamp-1 ${vTras ? 'text-accent' : ''}" data-squadra="${esc(partita.trasferta.nome)}">${partita.trasferta.nome}</span>
                    <span class="text-xs text-muted">${formatNumber(partita.fantapunti[1])} fp</span>
                </div>
            </div>
            ${dts}
        </div>
    `;
}

function renderMatchCardNext(partita) {
    let eloBar = '';
    const pr = partita.probabilita;
    if(pr) {
        // probabilità 1·X·2 del modello bayesiano (fantapunti simulati → gol con le soglie della lega)
        const p1 = Math.round(pr["1"] * 100), pX = Math.round(pr["X"] * 100), p2 = 100 - p1 - pX;
        const elo = partita.elo ? [partita.elo.casa.toFixed(0), partita.elo.trasferta.toFixed(0)] : ['-', '-'];
        const passa = pr.passa_1 !== undefined ? `<div class="text-[11px] text-muted text-center mt-1">Con i supplementari passa: ${Math.round(pr.passa_1 * 100)}% · ${Math.round(pr.passa_2 * 100)}%</div>` : '';
        eloBar = `
            <div class="w-full max-w-sm mt-6">
                <div class="flex justify-between text-xs text-muted mb-1">
                    <span>Elo: ${elo[0]}</span>
                    <span class="uppercase tracking-widest text-[10px]">Probabilità</span>
                    <span>Elo: ${elo[1]}</span>
                </div>
                <div class="h-2 w-full bg-black/30 rounded-full overflow-hidden flex border border-theme">
                    <div class="h-full bg-accent" style="width: ${p1}%"></div>
                    <div class="h-full bg-white/40" style="width: ${pX}%"></div>
                    <div class="h-full bg-white/15" style="width: ${p2}%"></div>
                </div>
                <div class="flex justify-between text-xs font-bold mt-1">
                    <span class="text-accent">1 · ${p1}%</span>
                    <span>X · ${pX}%</span>
                    <span>2 · ${p2}%</span>
                </div>
                ${passa}
            </div>
        `;
    } else if(partita.elo) {
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
            <span class="absolute top-4 bg-white/10 text-xs px-3 py-1 rounded-full font-semibold border border-theme">${partita.competizione === "Campionato" ? "Campionato" : (partita.fase || partita.competizione)}</span>
            
            <div class="flex items-center justify-between w-full max-w-sm mt-4">
                <div class="flex flex-col items-center w-5/12">
                    ${renderStemma(partita.casa, 'w-14 h-14 mb-2')}
                    <span class="font-bold text-sm text-center line-clamp-1" data-squadra="${esc(partita.casa.nome)}">${partita.casa.nome}</span>
                </div>
                <div class="w-2/12 flex justify-center"><span class="text-muted text-sm font-bold px-3 py-1 bg-black/20 rounded-lg">VS</span></div>
                <div class="flex flex-col items-center w-5/12">
                    ${renderStemma(partita.trasferta, 'w-14 h-14 mb-2')}
                    <span class="font-bold text-sm text-center line-clamp-1" data-squadra="${esc(partita.trasferta.nome)}">${partita.trasferta.nome}</span>
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
        <div class="flex flex-wrap gap-2 mb-6 pb-2" id="comp-tabs">
            ${compNames.map(name => `
                <button class="comp-tab whitespace-nowrap px-4 sm:px-6 py-2 rounded-full text-sm font-bold border transition-colors ${name === activeComp ? 'bg-accent border-accent' : 'surface border-theme text-muted hover:bg-white/5'}" data-comp="${name}">
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
                        <span class="truncate max-w-[92px] sm:max-w-xs text-sm sm:text-base" data-squadra="${esc(r.squadra.nome)}">${r.squadra.nome}</span>
                    </div>
                </td>
                <td class="px-1 py-3 sm:p-3 text-center font-black text-lg flex items-center justify-center">${r.pt}${penBadge}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell">${r.g}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell ${r.v ? 'text-accent' : 'text-muted'}">${r.v}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell text-muted">${r.n}</td>
                <td class="px-1 py-3 sm:p-3 text-center text-sm hidden sm:table-cell ${r.p ? 'text-danger' : 'text-muted'}">${r.p}</td>
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
                        <span class="truncate" data-squadra="${esc(s1.nome)}">${s1.nome}</span>
                        <span class="ml-auto font-mono bg-black/20 px-2 rounded">${sfida.totale?.[s1.nome]?.gol ?? '-'}</span>
                    </div>
                    <div class="flex items-center gap-2 ${p2 ? 'font-bold text-accent' : (sfida.finita && !p2 ? 'text-muted opacity-50' : '')}">
                        ${renderStemma(s2, 'w-6 h-6')}
                        <span class="truncate" data-squadra="${esc(s2.nome)}">${s2.nome}</span>
                        <span class="ml-auto font-mono bg-black/20 px-2 rounded">${sfida.totale?.[s2.nome]?.gol ?? '-'}</span>
                    </div>
                </div>

                <!-- Dettaglio Gare -->
                <div class="flex flex-col gap-2 text-xs text-muted sm:w-2/3 border-t sm:border-t-0 sm:border-l border-theme pt-3 sm:pt-0 sm:pl-4">
                    ${sfida.gare.map(g => `
                        <div class="flex justify-between items-center bg-white/5 p-2 rounded">
                            <span class="w-12">G. ${gLega(g.giornata)}</span>
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
                <span class="flex-1 truncate" data-squadra="${esc(sq.nome)}">${sq.nome}</span>
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
            <td class="p-3 font-semibold"><div class="flex items-center gap-3">${renderStemma(r.squadra, 'w-8 h-8')}<span class="truncate max-w-[140px] sm:max-w-xs" data-squadra="${esc(r.squadra.nome)}">${r.squadra.nome}</span></div></td>
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
const COLORI_FASCE = { Diamante: '#7dd3fc', Platino: '#c4d3e0', Oro: '#facc15', Argento: '#a3a3a3', Bronzo: '#cd7f32' };

function renderElo(container) {
    const classData = State.data?.elo?.classifica || [];
    const fasce = State.data?.elo?.fasce || [];
    const fasceTxt = fasce.map((f, i) => `${f.nome} ${f.da === null ? 'sotto ' + fasce[i - 1]?.da : 'da ' + f.da}`).join(', ');
    const bonusTxt = (State.data?.elo?.bonus_coppe || []).map(b => `${b.fase} +${formatNumber(b.punti, 0)}`).join(', ');
    
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
                        ${r.fascia ? `<span class="sm:hidden w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${COLORI_FASCE[r.fascia]}" title="${r.fascia}"></span>` : ''}
                        ${renderStemma(r.squadra, 'w-7 h-7')}
                        <span class="truncate max-w-[96px] sm:max-w-[130px]" data-squadra="${esc(r.squadra.nome)}">${r.squadra.nome}</span>
                    </div>
                </td>
                <td class="py-3 px-2 text-center font-bold font-mono text-base">${r.rating.toFixed(0)}</td>
                <td class="py-3 px-2 text-right font-mono text-xs whitespace-nowrap ${varColor}">${sign}${formatNumber(forma, 0)}</td>
                <td class="py-3 px-2 text-center hidden sm:table-cell">${r.fascia ? `<span class="text-xs font-bold px-2.5 py-1 rounded-full" style="background:${COLORI_FASCE[r.fascia]};color:#111">${r.fascia}</span>` : ''}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <div class="flex flex-col gap-6">
            <div class="surface p-4 rounded-2xl border border-theme h-[420px] flex flex-col relative">
                <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h3 class="font-bold">Andamento Stagionale</h3>
                    <div class="flex gap-2">
                        <button id="elo-tutte" class="text-xs font-semibold px-3 py-1 rounded-full border border-theme text-muted hover:text-main">Seleziona tutte</button>
                        <button id="elo-nessuna" class="text-xs font-semibold px-3 py-1 rounded-full border border-theme text-muted hover:text-main">Deseleziona tutte</button>
                    </div>
                </div>
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
                                <th class="py-3 px-2 text-center hidden sm:table-cell">Fascia</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="surface p-5 rounded-2xl border border-theme text-sm leading-relaxed">
                <h3 class="font-bold mb-3">Come si calcola il Rating Elo</h3>
                <ul class="list-disc pl-5 space-y-2 text-muted">
                    <li>Ogni squadra parte da <b class="text-main">1500</b>, la media della lega. Dopo ogni partita guadagna punti se fa meglio del previsto e ne perde se fa peggio: battere una squadra più forte vale più che battere una più debole.</li>
                    <li>Conta lo <b class="text-main">scarto di gol</b>: vincere di 2 o più gol vale di più. Una vittoria di 1 gol contro una squadra di pari livello vale circa +20.</li>
                    <li>Nelle <b class="text-main">coppe</b> non si perdono punti e ogni fase giocata dà un bonus${bonusTxt ? ': ' + bonusTxt : ''}.</li>
                    <li>Dopo ogni giornata la media torna a 1500: il rating dice quanto sei forte <b class="text-main">rispetto agli altri</b>.</li>
                    <li>Il rating segue l'<b class="text-main">allenatore</b>. Nelle prime 10 partite in carriera si muove il doppio; a inizio stagione si conserva un terzo della distanza da 1500.</li>
                    <li><b class="text-main">Fasce</b>${fasceTxt ? ': ' + fasceTxt : ''}.</li>
                    <li><b class="text-main">Forma</b>: variazione nelle ultime 5 giornate. Le probabilità 1 · X · 2 delle Prossime Sfide non vengono dall'Elo ma dal modello statistico sui fantapunti.</li>
                </ul>
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

    const labels = storia.map(s => s.giornata === null ? 'Inizio' : `${gLega(s.giornata)}ª`);
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
    const mostraTutte = v => { squadre.forEach((_, i) => State.chartInstance.setDatasetVisibility(i, v)); State.chartInstance.update(); };
    document.getElementById('elo-tutte')?.addEventListener('click', () => mostraTutte(true));
    document.getElementById('elo-nessuna')?.addEventListener('click', () => mostraTutte(false));

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
                        // con tutte le squadre visibili il clic sul nome isola quella squadra;
                        // altrimenti il clic aggiunge o toglie la squadra dal confronto
                        const ci = legend.chart, index = legendItem.datasetIndex;
                        const tutte = squadre.every((_, i) => ci.isDatasetVisible(i));
                        if(tutte) squadre.forEach((_, i) => ci.setDatasetVisibility(i, i === index));
                        else ci.setDatasetVisibility(index, !ci.isDatasetVisible(index));
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

    // sul telefono una tabella alla volta (schede), sul computer tutte e tre affiancate
    const tab = State.rankTab || 'storico';
    const pannelli = [['storico', 'Storico Assoluto', 'Storico', renderTable(d.storico, 'punti', 'Punti')],
                      ['standardizzato', 'Standardizzato (Media)', 'Media', renderTable(d.standardizzato, 'punti', 'Pt/Stag', true)],
                      ['ultime5', 'Ultime 5 Stagioni', 'Ultime 5', renderTable(d.ultime5_classifica, 'punti', 'Punti')]];
    const albo = State.data.albo || [];
    const comps = ['Campionato', 'Coppa', 'Champions'].filter(c => albo.some(r => r[c]));
    container.innerHTML = `
        <div class="flex gap-2 mb-4 lg:hidden">${pannelli.map(([k, , corto]) => `
            <button data-rank="${k}" class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold border ${k === tab ? 'bg-accent text-black border-accent' : 'surface border-theme text-muted'}">${corto}</button>`).join('')}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">${pannelli.map(([k, titolo, , tabella]) => `
            <div class="surface rounded-2xl border border-theme overflow-hidden flex-col ${k === tab ? 'flex' : 'hidden lg:flex'}">
                <div class="p-4 border-b border-theme bg-black/20"><h3 class="font-bold">${titolo}</h3></div>
                <div>${tabella}</div>
            </div>`).join('')}
        </div>
        ${albo.length ? `
        <h2 class="font-bold text-xl mt-10 mb-4">Albo d'oro</h2>
        <div class="surface rounded-2xl border border-theme overflow-hidden">
            <table class="w-full text-left border-collapse text-xs sm:text-sm">
                <thead class="bg-black/10 border-b border-theme">
                    <tr class="text-xs uppercase tracking-wider text-muted"><th class="p-2 sm:p-3">Stag.</th>${comps.map(c => `<th class="p-2 sm:p-3">${c === 'Campionato' ? 'Camp<span class="hidden sm:inline">ionato</span>' : c === 'Champions' ? 'Champ<span class="hidden sm:inline">ions</span>' : c}</th>`).join('')}</tr>
                </thead>
                <tbody>${albo.map(r => `
                    <tr class="border-b border-theme">
                        <td class="p-2 sm:p-3 font-mono text-muted whitespace-nowrap"><span class="hidden sm:inline">${esc(r.stagione.slice(0, 2))}</span>${esc(r.stagione.slice(2))}</td>
                        ${comps.map(c => `<td class="p-2 sm:p-3 ${c === 'Campionato' ? 'font-bold' : ''}">${r[c] ? esc(r[c]) : '<span class="text-muted">–</span>'}</td>`).join('')}
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>` : ''}
    `;
    container.querySelectorAll('[data-rank]').forEach(b => b.addEventListener('click', () => { State.rankTab = b.dataset.rank; renderRanking(container); }));
}

// --- STREAMING_CHUNK:View - Mercato & Montepremi... ---
function raggruppaOperazioni(ops) {
    // le righe con lo stesso id_operazione formano un'unica operazione (es. uno scambio con più giocatori)
    const gruppi = {};
    ops.forEach((op, i) => { const k = op.id_operazione ?? `riga-${i}`; (gruppi[k] ||= []).push(op); });
    return Object.values(gruppi).sort((a, b) => String(b[0].data || '').localeCompare(String(a[0].data || '')));
}

// colori dei ruoli come su Leghe
const COLORI_RUOLO = { P: '#f59e0b', D: '#22c55e', C: '#3b82f6', A: '#ef4444' };
const badgeRuolo = r => r ? `<span class="inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-black flex-shrink-0" style="background:${COLORI_RUOLO[r] || '#888'};color:#fff">${r}</span>` : '';
const schedaSquadra = nome => State.data.squadre.find(q => q.nome === nome) || { nome };
const dataBreve = d => d ? formatDate(String(d).slice(0, 10)) : '';

// finestra di mercato di un'operazione (dalla data)
function finestraDi(op, finestre) {
    // la finestra aperta più di recente prima dell'operazione (quelle senza chiusura valgono fino alla successiva)
    const d = String(op.data || '').slice(0, 10);
    const ok = (finestre || []).filter(f => f.apertura && d >= f.apertura && (!f.chiusura || d <= f.chiusura))
                               .sort((a, b) => b.apertura.localeCompare(a.apertura));
    return ok[0]?.descrizione || 'Altre operazioni';
}

function renderOperazione(righe) {
    const o = righe[0];
    const squadre = [...new Set(righe.flatMap(r => [r.da_squadra, r.a_squadra]).filter(Boolean))];
    const giocatore = r => `<div class="flex items-center gap-2 py-1 min-w-0">${badgeRuolo(r.ruolo)}<span class="text-sm font-semibold leading-tight break-words min-w-0">${esc(r.giocatore)}${r.note ? ` <span class="text-[10px] text-muted font-normal whitespace-nowrap">${esc(r.note)}</span>` : ''}</span></div>`;
    if(o.tipo === 'scambio' && squadre.length === 2) {
        const [s1, s2] = squadre;
        const lato = s => {
            const q = schedaSquadra(s), arrivi = righe.filter(r => r.a_squadra === s);
            const cred = arrivi.reduce((t, r) => t + (Number(r.crediti) || 0), 0);
            return `
            <div class="flex-1 min-w-0">
                <div class="flex flex-col items-center gap-1 mb-2 pb-2 border-b-2" style="border-color:${q.colore || 'var(--border)'}">
                    ${renderStemma(q, 'w-10 h-10')}
                    <span class="font-bold text-xs text-center leading-tight">${esc(s)}</span>
                </div>
                <div class="text-[10px] uppercase tracking-wider text-muted mb-1">Riceve</div>
                ${arrivi.map(giocatore).join('')}
                ${cred ? `<div class="text-xs text-accent font-semibold mt-1">+ ${cred} crediti</div>` : ''}
            </div>`;
        };
        return `
        <div class="surface p-4 rounded-2xl border border-theme">
            <div class="flex justify-between items-center mb-3 text-xs text-muted"><span class="font-semibold uppercase tracking-wider">Scambio</span><span>${dataBreve(o.data)}</span></div>
            <div class="flex gap-3 items-start">${lato(s1)}<div class="text-2xl text-muted self-center pt-2">⇄</div>${lato(s2)}</div>
        </div>`;
    }
    const tipo = (o.tipo || 'operazione').replace('_', ' ');
    return `
        <div class="surface p-4 rounded-2xl border border-theme">
            <div class="flex justify-between items-center mb-2 text-xs text-muted"><span class="font-semibold uppercase tracking-wider">${esc(tipo)}</span><span>${dataBreve(o.data)}</span></div>
            ${righe.map(r => `<div class="flex items-center gap-2">${renderStemma(schedaSquadra(r.a_squadra || r.da_squadra), 'w-7 h-7')}<div class="min-w-0">${giocatore(r)}<div class="text-xs text-muted">${esc(r.da_squadra || 'svincolati')} → ${esc(r.a_squadra || 'svincolati')}${r.crediti ? ` · ${r.crediti} crediti` : ''}</div></div></div>`).join('')}
        </div>`;
}

function bilancioMercato(ops) {
    const b = {};
    const voce = s => (b[s] ||= { op: new Set(), in: 0, out: 0, credIn: 0, credOut: 0 });
    ops.forEach(r => {
        if(r.a_squadra) { const v = voce(r.a_squadra); v.op.add(r.id_operazione); v.in++; v.credOut += Number(r.crediti) || 0; }
        if(r.da_squadra) { const v = voce(r.da_squadra); v.op.add(r.id_operazione); v.out++; v.credIn += Number(r.crediti) || 0; }
    });
    const conCrediti = ops.some(r => r.crediti);
    const righe = Object.entries(b).sort((x, y) => y[1].op.size - x[1].op.size || y[1].in - x[1].in).map(([s, v]) => `
        <tr class="border-b border-theme">
            <td class="py-2 px-2"><div class="flex items-center gap-2 min-w-0">${renderStemma(schedaSquadra(s), 'w-6 h-6')}<span class="truncate max-w-[120px] sm:max-w-none font-semibold" data-squadra="${esc(s)}">${esc(s)}</span></div></td>
            <td class="py-2 px-2 text-center">${v.op.size}</td>
            <td class="py-2 px-2 text-center text-accent font-semibold">+${v.in}</td>
            <td class="py-2 px-2 text-center text-danger font-semibold">−${v.out}</td>
            ${conCrediti ? `<td class="py-2 px-2 text-center hidden sm:table-cell">${v.credOut || '–'}</td><td class="py-2 px-2 text-center hidden sm:table-cell">${v.credIn || '–'}</td>` : ''}
        </tr>`).join('');
    return `
        <h3 class="font-bold text-lg mt-8 mb-3">Bilancio per squadra</h3>
        <div class="surface rounded-2xl border border-theme overflow-hidden">
            <table class="w-full text-sm border-collapse">
                <thead class="border-b border-theme bg-black/10 text-xs uppercase text-muted"><tr>
                    <th class="py-2 px-2 text-left">Squadra</th><th class="py-2 px-2"><span class="sm:hidden">Op.</span><span class="hidden sm:inline">Operazioni</span></th><th class="py-2 px-2"><span class="sm:hidden">In</span><span class="hidden sm:inline">Entrati</span></th><th class="py-2 px-2"><span class="sm:hidden">Out</span><span class="hidden sm:inline">Usciti</span></th>
                    ${conCrediti ? '<th class="py-2 px-2 hidden sm:table-cell">Crediti spesi</th><th class="py-2 px-2 hidden sm:table-cell">Crediti incassati</th>' : ''}
                </tr></thead><tbody>${righe}</tbody>
            </table>
        </div>`;
}

function renderMercato(container) {
    const m = State.data?.mercato;
    if(!m) { container.innerHTML = 'Nessun dato'; return; }

    const bannerClass = m.aperto ? 'bg-accent/10 border-accent/50 text-accent' : 'bg-white/5 border-theme text-muted';
    const bannerText = m.aperto
        ? `⚽ Mercato APERTO fino al ${formatDate(m.finestra_aperta.fino_al)}`
        : (m.prossima_finestra ? `🔒 Mercato CHIUSO &middot; Prossima finestra: ${m.prossima_finestra.descrizione} (${formatDate(m.prossima_finestra.dal)}${m.prossima_finestra.al ? ' - ' + formatDate(m.prossima_finestra.al) : ''})` : '🔒 Mercato CHIUSO');

    // filtro per finestra (le finestre con almeno un'operazione, dalla più recente)
    const finestre = [...new Set(m.operazioni.map(o => finestraDi(o, m.finestre)))];
    if(!finestre.includes(State.finestraMercato)) State.finestraMercato = null;
    const ops = State.finestraMercato ? m.operazioni.filter(o => finestraDi(o, m.finestre) === State.finestraMercato) : m.operazioni;
    const pulsante = (val, testo) => `<button data-finestra="${esc(val ?? '')}" class="filtro-finestra text-sm font-semibold px-4 py-1.5 rounded-full border border-theme ${State.finestraMercato === val ? 'bg-accent text-black' : 'text-muted'}">${esc(testo)}</button>`;

    container.innerHTML = `
        <div class="p-4 rounded-xl border ${bannerClass} text-center font-medium mb-6">${bannerText}</div>
        ${finestre.length > 1 ? `<div class="flex flex-wrap gap-2 mb-4">${pulsante(null, 'Tutte')}${finestre.map(f => pulsante(f, f)).join('')}</div>` : ''}
        <h3 class="font-bold text-lg mb-4">Operazioni${finestre.length === 1 ? ` <span class="text-sm text-muted font-normal">· ${esc(finestre[0])}</span>` : ''}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            ${ops.length > 0
                ? raggruppaOperazioni(ops).map(renderOperazione).join('')
                : `<div class="col-span-full text-center p-8 surface rounded-xl border border-theme border-dashed text-muted">Nessuna operazione registrata in questa finestra.</div>`}
        </div>
        ${ops.length ? bilancioMercato(ops) : ''}`;
    container.querySelectorAll('.filtro-finestra').forEach(b => b.addEventListener('click', () => {
        State.finestraMercato = b.dataset.finestra || null; renderMercato(container);
    }));
}

// ===================== Sezioni aggiunte il 12/10: Calendario, Statistiche, Pagina squadra, Albo, conto alla rovescia
const linkSquadra = (nome, cls = '') => `<span data-squadra="${esc(nome)}" class="cursor-pointer hover:underline ${cls}">${esc(nome)}</span>`;
const fmtNum = (v, d = 1) => v === null || v === undefined ? '–' : Number(v).toFixed(d).replace('.', ',');

function tempoMancante(iso) {
    if(!iso) return '';
    const ms = new Date(iso.includes('T') ? iso : iso + 'T12:00') - new Date();
    if(ms <= 0) return 'chiusa';
    const min = Math.floor(ms / 60000), g = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    return 'chiude tra ' + (g ? `${g} g ${h} h` : h ? `${h} h ${m} min` : `${m} min`);
}
function avviaContoAllaRovescia(iso) {
    const agg = () => document.querySelectorAll('.conto-rovescia').forEach(el => el.textContent = tempoMancante(iso));
    agg();
    clearInterval(State.carouselTimers.contoRovescia);
    State.carouselTimers.contoRovescia = setInterval(agg, 30000);
}

// --- Calendario: una giornata alla volta, con frecce e scelta della giornata
function renderCalendario(container) {
    const tutte = State.data.partite || [];
    const comps = [...new Set(tutte.map(p => p.c))];
    if(!comps.length) { container.innerHTML = '<div class="p-8 text-center text-muted">Calendario non disponibile.</div>'; return; }
    if(!comps.includes(State.calComp)) State.calComp = comps[0];
    const partite = tutte.filter(p => p.c === State.calComp);
    const giornate = [...new Set(partite.map(p => p.g))].sort((a, b) => a - b);
    const prossima = giornate.find(g => partite.some(p => p.g === g && !p.gol)) ?? giornate[giornate.length - 1];
    if(!giornate.includes(State.calG)) State.calG = prossima;
    const i = giornate.indexOf(State.calG);
    const sq = n => State.data.squadre.find(q => q.nome === n) || { nome: n };
    // nomi di una sola parola lunga: più piccoli sul telefono, così non vengono spezzati
    const dim = n => !n.includes(' ') && n.length > 10 ? 'text-[10px] sm:text-sm tracking-tight' : 'text-xs sm:text-sm';
    const riga = p => {
        const vC = p.gol && p.gol[0] > p.gol[1], vT = p.gol && p.gol[1] > p.gol[0];
        return `
        <div class="flex items-center gap-1.5 sm:gap-2 py-3 border-b border-theme last:border-b-0">
            <div class="flex items-center gap-2 justify-end flex-1 min-w-0 text-right">
                <span class="line-clamp-2 leading-tight ${dim(p.casa)} ${vC ? 'font-bold text-accent' : 'font-semibold'}" data-squadra="${esc(p.casa)}">${esc(p.casa)}</span>${renderStemma(sq(p.casa), 'w-6 h-6 sm:w-7 sm:h-7')}
            </div>
            <div class="w-16 sm:w-24 text-center flex-shrink-0">
                ${p.gol ? `<div class="font-black text-base sm:text-lg font-mono">${p.gol[0]} - ${p.gol[1]}</div><div class="text-[9px] sm:text-[10px] text-muted whitespace-nowrap">${fmtNum(p.fp[0])}–${fmtNum(p.fp[1])}</div>${p.dts ? `<div class="text-[10px] text-accent">d.t.s. ${esc(p.dts)}</div>` : ''}`
                         : '<div class="text-muted text-sm">vs</div>'}
            </div>
            <div class="flex items-center gap-2 flex-1 min-w-0">
                ${renderStemma(sq(p.trasf), 'w-6 h-6 sm:w-7 sm:h-7')}<span class="line-clamp-2 leading-tight ${dim(p.trasf)} ${vT ? 'font-bold text-accent' : 'font-semibold'}" data-squadra="${esc(p.trasf)}">${esc(p.trasf)}</span>
            </div>
        </div>`;
    };
    const diG = partite.filter(p => p.g === State.calG);
    const fasi = [...new Set(diG.map(p => p.f))];
    container.innerHTML = `
        <div class="flex flex-wrap gap-2 mb-6">${comps.map(c => `<button data-cal-comp="${esc(c)}" class="px-4 sm:px-6 py-2 rounded-full text-sm font-bold border ${c === State.calComp ? 'bg-accent border-accent text-black' : 'surface border-theme text-muted'}">${esc(c)}</button>`).join('')}</div>
        <div class="surface rounded-2xl border border-theme overflow-hidden max-w-3xl">
            <div class="flex items-center justify-between gap-2 p-4 border-b border-theme bg-black/10">
                <button id="cal-prec" class="w-9 h-9 rounded-full border border-theme ${i > 0 ? '' : 'opacity-30'}" ${i > 0 ? '' : 'disabled'} aria-label="Giornata precedente">‹</button>
                <select id="cal-sel" class="surface border border-theme rounded-lg px-3 py-1.5 text-sm font-bold">
                    ${giornate.map(g => `<option value="${g}" ${g === State.calG ? 'selected' : ''}>${gLega(g)}ª giornata${g === prossima ? ' (prossima)' : ''}</option>`).join('')}
                </select>
                <button id="cal-succ" class="w-9 h-9 rounded-full border border-theme ${i < giornate.length - 1 ? '' : 'opacity-30'}" ${i < giornate.length - 1 ? '' : 'disabled'} aria-label="Giornata successiva">›</button>
            </div>
            <div class="px-2 sm:px-4">${fasi.map(f => `${fasi.length > 1 || State.calComp !== 'Campionato' ? `<div class="text-xs uppercase tracking-wider text-muted pt-3">${esc(f)}</div>` : ''}${diG.filter(p => p.f === f).map(riga).join('')}`).join('')}</div>
        </div>
        <p class="text-xs text-muted mt-3">Giornate di Lega (la 1ª è la ${State.data.lega.prima_giornata}ª di Serie A). Sotto il risultato i fantapunti. Clicca una squadra per la sua scheda.</p>`;
    container.querySelectorAll('[data-cal-comp]').forEach(b => b.addEventListener('click', () => { State.calComp = b.dataset.calComp; State.calG = null; renderCalendario(container); }));
    container.querySelector('#cal-sel').addEventListener('change', e => { State.calG = Number(e.target.value); renderCalendario(container); });
    container.querySelector('#cal-prec').addEventListener('click', () => { State.calG = giornate[i - 1]; renderCalendario(container); });
    container.querySelector('#cal-succ').addEventListener('click', () => { State.calG = giornate[i + 1]; renderCalendario(container); });
}

// --- Statistiche: record, serie, Culometro (classifica della fortuna)
function renderStatistiche(container) {
    const S = State.data.statistiche;
    if(!S) { container.innerHTML = '<div class="p-8 text-center text-muted">Le statistiche compariranno dopo la prima giornata.</div>'; return; }
    const sq = n => State.data.squadre.find(q => q.nome === n) || { nome: n };
    const tile = (titolo, corpo, nota = '') => `<div class="surface rounded-2xl border border-theme p-4 flex flex-col gap-2"><span class="text-xs text-muted font-semibold uppercase tracking-wider">${titolo}</span>${corpo}${nota ? `<span class="text-xs text-muted">${nota}</span>` : ''}</div>`;
    const prest = r => `<div class="flex items-center gap-2">${renderStemma(sq(r.squadra), 'w-8 h-8')}<div class="min-w-0"><div class="font-bold truncate" data-squadra="${esc(r.squadra)}">${esc(r.squadra)}</div><div class="text-sm"><b class="font-mono">${fmtNum(r.fp)}</b> fp · ${r.gol} gol · ${gLega(r.giornata)}ª giornata</div></div></div>`;
    const partita = p => p ? `<div class="text-sm"><span data-squadra="${esc(p.casa)}" class="font-semibold">${esc(p.casa)}</span> <b class="font-mono">${p.gol[0]}-${p.gol[1]}</b> <span data-squadra="${esc(p.trasferta)}" class="font-semibold">${esc(p.trasferta)}</span></div><div class="text-xs text-muted">${fmtNum(p.fp[0])} – ${fmtNum(p.fp[1])} fp · ${gLega(p.giornata)}ª giornata${p.competizione !== 'Campionato' ? ' · ' + esc(p.fase) : ''}</div>` : '<span class="text-muted text-sm">–</span>';
    // una prestazione vista da una squadra: fantapunti, risultato e avversario (per la beffa e il colpaccio)
    const lato = x => x ? `<div class="flex items-center gap-2">${renderStemma(sq(x.squadra), 'w-8 h-8')}<div class="min-w-0"><div class="font-bold truncate" data-squadra="${esc(x.squadra)}">${esc(x.squadra)}</div><div class="text-sm"><b class="font-mono">${fmtNum(x.fp)}</b> fp · ${x.esito === 'V' ? 'vittoria' : x.esito === 'N' ? 'pareggio' : 'sconfitta'} <b class="font-mono">${x.gol}-${x.gol_avv}</b></div><div class="text-xs text-muted">contro <span data-squadra="${esc(x.avversario)}">${esc(x.avversario)}</span> (${fmtNum(x.fp_avv)} fp) · ${gLega(x.giornata)}ª giornata${x.competizione !== 'Campionato' ? ' · ' + esc(x.fase) : ''}</div></div></div>` : '<span class="text-muted text-sm">–</span>';
    const serie = (x, cosa) => x ? `<div class="flex items-center gap-2">${renderStemma(sq(x[0]), 'w-8 h-8')}<div><div class="font-bold" data-squadra="${esc(x[0])}">${esc(x[0])}</div><div class="text-sm">${x[1]} ${cosa} di fila</div></div></div>` : '<span class="text-muted text-sm">nessuna serie in corso</span>';
    const pallino = e => `<span class="inline-block w-4 h-4 rounded-full text-[9px] font-black leading-4 text-center text-white" style="background:${e === 'V' ? '#22c55e' : e === 'N' ? '#9ca3af' : '#ef4444'}">${e}</span>`;
    const righe = S.fortuna.map((r, i) => `
        <tr class="border-b border-theme">
            <td class="py-2 px-2 text-center text-muted hidden sm:table-cell">${i + 1}</td>
            <td class="py-2 px-2"><div class="flex items-center gap-2 min-w-0">${renderStemma(sq(r.squadra), 'w-6 h-6')}<span class="truncate max-w-[110px] sm:max-w-none font-semibold" data-squadra="${esc(r.squadra)}">${esc(r.squadra)}</span></div></td>
            <td class="py-2 px-1 sm:px-2 text-center font-bold">${fmtNum(r.reali, 0)}</td>
            <td class="py-2 px-1 sm:px-2 text-center font-mono">${fmtNum(r.meritati)}</td>
            <td class="py-2 px-1 sm:px-2 text-center font-mono font-bold ${r.fortuna > 0 ? 'text-accent' : r.fortuna < 0 ? 'text-danger' : ''}">${r.fortuna > 0 ? '+' : ''}${fmtNum(r.fortuna)}</td>
            <td class="py-2 px-2 text-center hidden sm:table-cell font-mono">${fmtNum(S.media_fp[r.squadra], 2)}</td>
            <td class="py-2 px-2 hidden md:table-cell"><div class="flex gap-1 justify-center">${(S.forma[r.squadra] || []).map(pallino).join('')}</div></td>
        </tr>`).join('');
    container.innerHTML = `
        <h3 class="font-bold text-lg mb-3">Ultima giornata (${gLega(S.giornata)}ª)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            ${tile('Miglior punteggio', prest(S.giornata_migliore))}
            ${tile('Peggior punteggio', prest(S.giornata_peggiore))}
            ${tile('Media della lega', `<div class="text-2xl font-black font-mono">${fmtNum(S.media_lega, 2)}</div>`, 'fantapunti a partita nel Campionato, da inizio stagione')}
        </div>
        <h3 class="font-bold text-lg mb-3">Record della stagione</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            ${tile('Punteggio più alto', prest(S.stagione_migliore))}
            ${tile('Punteggio più basso', prest(S.stagione_peggiore))}
            ${tile('Partita con più gol', partita(S.partita_piu_gol))}
            ${tile('Vittoria più larga', partita(S.vittoria_piu_larga))}
            ${tile('😤 La beffa', lato(S.beffa), 'il punteggio più alto che non è bastato per vincere')}
            ${tile('🥷 Il colpaccio', lato(S.colpaccio), 'il punteggio più basso che è bastato per vincere')}
        </div>
        <h3 class="font-bold text-lg mb-3">Serie in corso (Campionato)</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            ${tile('Vittorie consecutive', serie(S.serie_vittorie, 'vittorie'))}
            ${tile('Imbattuta', serie(S.serie_imbattuta, 'risultati utili'))}
            ${tile('Sconfitte consecutive', serie(S.serie_sconfitte, 'sconfitte'))}
        </div>
        <h3 class="font-bold text-lg mb-1">🍀 Culometro</h3>
        <p class="text-sm text-muted mb-3">Chi sta raccogliendo più punti di quanti ne meriterebbe (in alto) e chi meno (in fondo). I punti "meritati" sono quelli che i tuoi gol avrebbero fatto, in media, contro <b>tutte</b> le altre squadre della stessa giornata: nel fantacalcio l'avversario non dipende da te. Fortuna = punti sul campo − punti meritati (penalità escluse).</p>
        <div class="surface rounded-2xl border border-theme overflow-hidden">
            <table class="w-full text-sm border-collapse">
                <thead class="border-b border-theme bg-black/10 text-xs uppercase text-muted"><tr>
                    <th class="py-2 px-2 hidden sm:table-cell">#</th><th class="py-2 px-2 text-left">Squadra</th><th class="py-2 px-1 sm:px-2" title="Punti sul campo">Pt</th><th class="py-2 px-1 sm:px-2">Merit<span class="hidden sm:inline">ati</span></th><th class="py-2 px-1 sm:px-2">Fort<span class="hidden sm:inline">una</span></th>
                    <th class="py-2 px-2 hidden sm:table-cell">Media fp</th><th class="py-2 px-2 hidden md:table-cell">Ultime 5</th>
                </tr></thead><tbody>${righe}</tbody>
            </table>
        </div>`;
}

// --- Pagina squadra
function renderSquadra(container) {
    const nome = State.squadraSel, D = State.data;
    const q = D.squadre.find(x => x.nome === nome);
    if(!q) { container.innerHTML = '<div class="p-8 text-center text-muted">Squadra non trovata.</div>'; return; }
    const sq = n => D.squadre.find(x => x.nome === n) || { nome: n };
    let posCamp = null;
    try { posCamp = D.competizioni.Campionato.fasi[0].classifica.find(r => r.squadra.nome === nome); } catch(e) {}
    const elo = D.elo?.classifica?.find(r => r.squadra.nome === nome);
    const eloPos = D.elo?.classifica?.findIndex(r => r.squadra.nome === nome) + 1;
    const forza = D.forza?.[nome];
    const mie = (D.partite || []).filter(p => p.casa === nome || p.trasf === nome);
    const giocate = mie.filter(p => p.gol), future = mie.filter(p => !p.gol).slice(0, 5);
    const S = D.statistiche;
    const tile = (t, v, n = '') => `<div class="surface rounded-2xl border border-theme p-4"><div class="text-xs text-muted font-semibold uppercase tracking-wider mb-1">${t}</div><div class="text-xl font-black">${v}</div>${n ? `<div class="text-xs text-muted mt-1">${n}</div>` : ''}</div>`;
    const esito = p => { const io = p.casa === nome ? 0 : 1, a = p.gol[io], b = p.gol[1 - io]; return a > b ? 'V' : a < b ? 'P' : 'N'; };
    const coloreEsito = e => e === 'V' ? '#22c55e' : e === 'N' ? '#9ca3af' : '#ef4444';
    const probProssima = p => {
        const pp = D.prossima_giornata?.partite?.find(x => x.casa.nome === p.casa && x.trasferta.nome === p.trasf && x.fase === p.f);
        if(!pp?.probabilita) return '';
        const pr = pp.probabilita, io = p.casa === nome;
        const v = io ? pr['1'] : pr['2'], x = pr['X'], s = io ? pr['2'] : pr['1'];
        return `<span class="text-xs text-muted">vittoria ${Math.round(v * 100)}% · pari ${Math.round(x * 100)}% · sconfitta ${Math.round(s * 100)}%</span>`;
    };
    const ops = (D.mercato?.operazioni || []).filter(o => o.da_squadra === nome || o.a_squadra === nome);
    const titoli = (D.albo || []).flatMap(a => ['Campionato', 'Champions', 'Coppa'].filter(c => a[c] && q.allenatori.some(al => a[c].split(' e ').includes(al))).map(c => `${c} ${a.stagione}`));
    container.innerHTML = `
        <button id="torna" class="text-sm text-muted hover:text-main mb-4">← Indietro</button>
        <div class="surface rounded-2xl border border-theme p-5 mb-6 flex items-center gap-4" style="border-left: 6px solid ${q.colore || 'var(--accent)'}">
            ${renderStemma(q, 'w-16 h-16')}
            <div class="min-w-0">
                <div class="text-xl sm:text-2xl font-black break-words leading-tight">${esc(nome)}</div>
                <div class="text-sm text-muted">Allenatore: <b class="text-main">${q.allenatori.map(esc).join(', ')}</b></div>
                ${titoli.length ? `<div class="text-xs mt-1">🏆 ${titoli.map(esc).join(' · ')}</div>` : ''}
            </div>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            ${tile('Campionato', posCamp ? `${posCamp.pos}ª · ${posCamp.pt} pt` : '–', posCamp ? `${posCamp.v}V ${posCamp.n}N ${posCamp.p}P` : '')}
            ${tile('Rating Elo', elo ? `${elo.rating.toFixed(0)}` : '–', elo ? `${eloPos}° · fascia ${elo.fascia}` : '')}
            ${tile('Forza stimata', forza ? `${forza.media > 0 ? '+' : ''}${fmtNum(forza.media)} fp` : '–', forza ? `${Math.round(forza.prob_sopra_media * 100)}% di essere sopra la media` : '')}
            ${tile('Media fantapunti', S?.media_fp?.[nome] ? fmtNum(S.media_fp[nome], 2) : '–', S ? `media della lega ${fmtNum(S.media_lega, 2)}` : '')}
        </div>
        <div class="surface rounded-2xl border border-theme p-4 mb-6 h-72 flex flex-col">
            <h3 class="font-bold mb-2">Fantapunti giornata per giornata</h3>
            <div class="flex-1 relative"><canvas id="grafico-squadra"></canvas></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <h3 class="font-bold text-lg mb-3">Prossime partite</h3>
                <div class="surface rounded-2xl border border-theme divide-y divide-[var(--border)]">${future.length ? future.map(p => {
                    const avv = p.casa === nome ? p.trasf : p.casa;
                    return `<div class="p-3 flex items-center gap-3">${renderStemma(sq(avv), 'w-7 h-7')}<div class="min-w-0 flex-1"><div class="text-sm font-semibold truncate">${p.casa === nome ? 'vs' : '@'} <span data-squadra="${esc(avv)}">${esc(avv)}</span></div><div class="text-xs text-muted">${gLega(p.g)}ª giornata · ${p.c === 'Campionato' ? 'Campionato' : esc(p.f)}</div>${probProssima(p)}</div></div>`;
                }).join('') : '<div class="p-4 text-sm text-muted">Nessuna partita in programma.</div>'}</div>
            </div>
            <div>
                <h3 class="font-bold text-lg mb-3">Risultati</h3>
                <div class="surface rounded-2xl border border-theme divide-y divide-[var(--border)]">${giocate.length ? giocate.slice().reverse().map(p => {
                    const io = p.casa === nome ? 0 : 1, avv = io ? p.casa : p.trasf, e = esito(p);
                    return `<div class="p-3 flex items-center gap-3"><span class="w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center text-white flex-shrink-0" style="background:${coloreEsito(e)}">${e}</span><div class="min-w-0 flex-1"><div class="text-sm font-semibold truncate">${io ? '@' : 'vs'} <span data-squadra="${esc(avv)}">${esc(avv)}</span> <b class="font-mono">${p.gol[io]}-${p.gol[1 - io]}</b></div><div class="text-xs text-muted">${gLega(p.g)}ª · ${p.c === 'Campionato' ? 'Campionato' : esc(p.f)} · ${fmtNum(p.fp[io])} fp</div></div></div>`;
                }).join('') : '<div class="p-4 text-sm text-muted">Nessuna partita giocata.</div>'}</div>
            </div>
        </div>
        ${ops.length ? `<h3 class="font-bold text-lg mt-8 mb-3">Mercato</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-4">${raggruppaOperazioni((D.mercato.operazioni || []).filter(o => ops.some(x => x.id_operazione === o.id_operazione))).map(renderOperazione).join('')}</div>` : ''}`;
    container.querySelector('#torna').addEventListener('click', () => { State.view = State.vistaPrecedente || 'home'; renderView(); });
    // grafico: fantapunti della squadra (Campionato) contro la media della lega di ogni giornata
    const camp = (D.partite || []).filter(p => p.c === 'Campionato' && p.gol);
    const gg = [...new Set(camp.map(p => p.g))].sort((a, b) => a - b);
    const mio = gg.map(g => { const p = camp.find(x => x.g === g && (x.casa === nome || x.trasf === nome)); return p ? p.fp[p.casa === nome ? 0 : 1] : null; });
    const media = gg.map(g => { const v = camp.filter(x => x.g === g).flatMap(x => x.fp); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
    const testo = State.theme === 'dark' ? '#9ca3af' : '#6b7280', griglia = State.theme === 'dark' ? '#333633' : '#e5e7eb';
    if(State.graficoSquadra) State.graficoSquadra.destroy();
    State.graficoSquadra = new Chart(document.getElementById('grafico-squadra'), {
        type: 'line',
        data: { labels: gg.map(g => `${gLega(g)}ª`), datasets: [
            { label: nome, data: mio, borderColor: q.colore || '#c4ff00', backgroundColor: q.colore || '#c4ff00', borderWidth: 3, tension: 0.3, pointRadius: 4 },
            { label: 'Media della lega', data: media, borderColor: testo, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
            { label: 'Soglia 1° gol (66)', data: gg.map(() => 66), borderColor: griglia, borderWidth: 1, pointRadius: 0 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { color: testo, boxWidth: 10 } } },
                   scales: { x: { ticks: { color: testo }, grid: { color: griglia } }, y: { ticks: { color: testo }, grid: { color: griglia } } } }
    });
}

// --- STREAMING_CHUNK:Bootstrapping... ---
document.addEventListener('DOMContentLoaded', initApp);

    
