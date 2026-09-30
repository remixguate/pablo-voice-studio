const $ = id => document.getElementById(id);

let voices = [];
let favorites = JSON.parse(
    localStorage.getItem('pabloVoiceFavorites') || '[]'
);

const sampleText =
    'Hola, esta es una muestra de mi voz. Gracias por usar Pablo Voice Studio.';


/* =========================
   CARGAR VOCES
========================= */

async function load() {

    try {

        const r = await fetch('/api/voices');

        if (!r.ok) {
            throw new Error('No se pudieron cargar las voces.');
        }

        voices = await r.json();

        populateLanguages();
        populateGenders();
        renderVoices();

        if (voices.length > 0) {
            selectVoice(voices[0].id);
        }

        updateVoiceCount();

    } catch (e) {

        console.error(e);

        if ($('voiceList')) {
            $('voiceList').innerHTML = `
                <div class="voice-empty">
                    No se pudieron cargar las voces.
                </div>
            `;
        }

        if ($('msg')) {
            $('msg').textContent = e.message;
        }

    }

}


/* =========================
   IDIOMAS
========================= */

function populateLanguages() {

    const select = $('languageFilter');

    if (!select) return;

    const languages = [
        ...new Set(
            voices
                .map(v => v.lang)
                .filter(Boolean)
        )
    ].sort();

    select.innerHTML = `
        <option value="">
            Todos los idiomas
        </option>

        ${languages.map(lang => `
            <option value="${escapeHTML(lang)}">
                ${escapeHTML(languageName(lang))}
            </option>
        `).join('')}
    `;
}


/* =========================
   GÉNEROS
========================= */

function populateGenders() {

    const select = $('genderFilter');

    if (!select) return;

    const genders = [
        ...new Set(
            voices
                .map(v => normalizeGender(v.gender))
                .filter(Boolean)
        )
    ];

    select.innerHTML = `
        <option value="">
            Todos
        </option>

        ${genders.map(gender => `
            <option value="${escapeHTML(gender)}">
                ${gender === 'F'
                    ? 'Femeninas'
                    : 'Masculinas'}
            </option>
        `).join('')}
    `;
}


/* =========================
   MOSTRAR VOCES
========================= */

function renderVoices() {

    const container = $('voiceList');

    if (!container) return;

    const search =
        ($('voiceSearch')?.value || '')
        .toLowerCase()
        .trim();

    const language =
        $('languageFilter')?.value || '';

    const gender =
        $('genderFilter')?.value || '';


    let filtered = voices.filter(v => {

        const searchable =
            `${v.name || ''}
             ${v.id || ''}
             ${v.lang || ''}`
            .toLowerCase();

        const matchesSearch =
            !search ||
            searchable.includes(search);

        const matchesLanguage =
            !language ||
            v.lang === language;

        const matchesGender =
            !gender ||
            normalizeGender(v.gender) === gender;

        return (
            matchesSearch &&
            matchesLanguage &&
            matchesGender
        );

    });


    /* FAVORITOS PRIMERO */

    filtered.sort((a, b) => {

        const favA =
            favorites.includes(a.id);

        const favB =
            favorites.includes(b.id);

        if (favA && !favB) return -1;

        if (!favA && favB) return 1;

        return (
            a.name || a.id
        ).localeCompare(
            b.name || b.id
        );

    });


    if (!filtered.length) {

        container.innerHTML = `
            <div class="voice-empty">
                No se encontraron voces.
            </div>
        `;

        updateVoiceCount(0);

        return;
    }


    container.innerHTML = filtered.map(v => {

        const favorite =
            favorites.includes(v.id);

        const genderText =
            normalizeGender(v.gender) === 'F'
                ? 'Femenina'
                : 'Masculina';


        return `

            <div
                class="voice-card ${favorite ? 'favorite' : ''}"
                data-voice="${escapeHTML(v.id)}"
            >

                <button
                    class="favorite-btn"
                    title="${
                        favorite
                        ? 'Quitar de favoritos'
                        : 'Agregar a favoritos'
                    }"
                    onclick="toggleFavorite('${escapeJS(v.id)}')"
                >
                    ${favorite ? '★' : '☆'}
                </button>


                <div
                    class="voice-info"
                    onclick="selectVoice('${escapeJS(v.id)}')"
                >

                    <div class="voice-name">
                        ${escapeHTML(
                            v.name || v.id
                        )}
                    </div>

                    <div class="voice-meta">
                        ${escapeHTML(
                            v.lang || ''
                        )}

                        ${
                            v.gender
                            ? ` · ${genderText}`
                            : ''
                        }
                    </div>

                </div>


                <button
                    class="preview-btn"
                    title="Escuchar muestra"
                    onclick="previewVoice('${escapeJS(v.id)}')"
                >
                    ▶
                </button>

            </div>

        `;

    }).join('');


    updateVoiceCount(
        filtered.length
    );

}


/* =========================
   SELECCIONAR VOZ
========================= */

function selectVoice(id) {

    const voice =
        voices.find(v => v.id === id);

    if (!voice) return;


    if ($('voice')) {
        $('voice').value = id;
    }


    document
        .querySelectorAll('.voice-card')
        .forEach(card =>
            card.classList.remove('selected')
        );


    const card =
        document.querySelector(
            `.voice-card[data-voice="${CSS.escape(id)}"]`
        );


    if (card) {
        card.classList.add('selected');
    }


    if ($('selectedVoice')) {

        $('selectedVoice').textContent =
            voice.name || voice.id;

    }

}


/* =========================
   FAVORITOS
========================= */

function toggleFavorite(id) {

    if (favorites.includes(id)) {

        favorites =
            favorites.filter(
                v => v !== id
            );

    } else {

        favorites.push(id);

    }


    localStorage.setItem(
        'pabloVoiceFavorites',
        JSON.stringify(favorites)
    );


    renderVoices();

    selectVoice(id);

}


/* =========================
   ESCUCHAR MUESTRA
========================= */

async function previewVoice(id) {

    const voice =
        voices.find(v => v.id === id);

    if (!voice) return;


    const btn =
        document.querySelector(
            `.voice-card[data-voice="${CSS.escape(id)}"] .preview-btn`
        );


    if (btn) {

        btn.disabled = true;
        btn.textContent = '…';

    }


    try {

        const res =
            await fetch(
                '/api/synthesize',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body: JSON.stringify({

                        text: sampleText,

                        voice: id,

                        format: 'mp3',

                        rate: 0,

                        pitch: 0,

                        volume: 0

                    })

                }
            );


        if (!res.ok) {

            let error =
                'No se pudo reproducir la muestra.';

            try {

                const data =
                    await res.json();

                error =
                    data.detail || error;

            } catch {}

            throw new Error(error);

        }


        const blob =
            await res.blob();

        const url =
            URL.createObjectURL(blob);


        const audio =
            new Audio(url);


        audio.onended = () => {

            URL.revokeObjectURL(url);

        };


        await audio.play();


    } catch (e) {

        if ($('msg')) {
            $('msg').textContent =
                e.message;
        }

    } finally {

        if (btn) {

            btn.disabled = false;
            btn.textContent = '▶';

        }

    }

}


/* =========================
   GENERAR VOZ
========================= */

$('generate').onclick =
    async () => {

        const btn =
            $('generate');

        const msg =
            $('msg');

        msg.textContent = '';


        const text =
            $('text').value.trim();


        if (!text) {

            msg.textContent =
                'Escribe un texto antes de generar.';

            return;

        }


        const selectedVoice =
            $('voice').value;


        if (!selectedVoice) {

            msg.textContent =
                'Selecciona una voz.';

            return;

        }


        btn.disabled = true;

        btn.textContent =
            'GENERANDO…';


        try {

            const res =
                await fetch(
                    '/api/synthesize',
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body: JSON.stringify({

                            text,

                            voice:
                                selectedVoice,

                            format:
                                $('format').value,

                            rate:
                                +$('rate').value,

                            pitch:
                                +$('pitch').value,

                            volume:
                                +$('volume').value

                        })
                    }
                );


            if (!res.ok) {

                let error =
                    'Error al generar la voz.';

                try {

                    const data =
                        await res.json();

                    error =
                        data.detail ||
                        error;

                } catch {}

                throw new Error(error);

            }


            const blob =
                await res.blob();


            const url =
                URL.createObjectURL(blob);


            $('audio').src =
                url;


            $('download').href =
                url;


            $('download').download =
                `pablo_voice.${$('format').value}`;


            $('result')
                .classList
                .remove('hidden');


        } catch (e) {

            msg.textContent =
                e.message;

        } finally {

            btn.disabled = false;

            btn.textContent =
                'GENERAR VOZ';

        }

    };


/* =========================
   CONTROLES
========================= */

[
    ['rate', 'rateVal', '%'],
    ['pitch', 'pitchVal', ''],
    ['volume', 'volumeVal', '%']

].forEach(
    ([a, b, suffix]) => {

        if ($(a) && $(b)) {

            $(a).addEventListener(
                'input',
                () => {

                    $(b).textContent =
                        $(a).value +
                        suffix;

                }
            );

        }

    }
);


/* =========================
   CONTADOR DE TEXTO
========================= */

$('text')?.addEventListener(
    'input',
    () => {

        if ($('charCount')) {

            $('charCount').textContent =
                $('text').value.length;

        }

    }
);


/* =========================
   FILTROS
========================= */

$('voiceSearch')?.addEventListener(
    'input',
    renderVoices
);


$('languageFilter')?.addEventListener(
    'change',
    renderVoices
);


$('genderFilter')?.addEventListener(
    'change',
    renderVoices
);


/* =========================
   UTILIDADES
========================= */

function normalizeGender(gender) {

    if (!gender) return '';

    const value =
        gender
            .toString()
            .toLowerCase();


    if (
        value === 'female' ||
        value === 'f'
    ) {
        return 'F';
    }


    if (
        value === 'male' ||
        value === 'm'
    ) {
        return 'M';
    }


    return gender;

}


function languageName(locale) {

    const languages = {

        'es': 'Español',

        'es-ES':
            'Español — España',

        'es-MX':
            'Español — México',

        'es-US':
            'Español — Estados Unidos',

        'en':
            'English',

        'en-US':
            'English — USA',

        'en-GB':
            'English — UK',

        'fr-FR':
            'Français — France',

        'de-DE':
            'Deutsch — Alemania',

        'it-IT':
            'Italiano — Italia',

        'pt-BR':
            'Português — Brasil',

        'pt-PT':
            'Português — Portugal',

        'ja-JP':
            '日本語 — Japón',

        'ko-KR':
            '한국어 — Corea',

        'zh-CN':
            '中文 — China'

    };


    return (
        languages[locale] ||
        locale
    );

}


function updateVoiceCount(
    count = voices.length
) {

    if ($('voiceCount')) {

        $('voiceCount').textContent =
            `${count} ${
                count === 1
                ? 'voz'
                : 'voces'
            }`;

    }

}


function escapeHTML(value) {

    return String(value)

        .replace(
            /&/g,
            '&amp;'
        )

        .replace(
            /</g,
            '&lt;'
        )

        .replace(
            />/g,
            '&gt;'
        )

        .replace(
            /"/g,
            '&quot;'
        )

        .replace(
            /'/g,
            '&#039;'
        );

}


function escapeJS(value) {

    return String(value)

        .replace(
            /\\/g,
            '\\\\'
        )

        .replace(
            /'/g,
            "\\'"
        );

}


/* =========================
   INICIO
========================= */

load();
