const afleveringenPerSeizoen = [24, 24, 25, 24, 24, 25, 24, 24, 24, 18];

// kies willekeurige aflevering cijfers
function getRandomEpisodeNumbers() {
    const randomSeizoen = Math.floor(Math.random() * 10) + 1;
    const maxAfleveringen = afleveringenPerSeizoen[randomSeizoen - 1];
    const randomAflevering = Math.floor(Math.random() * maxAfleveringen) + 1;
    return { seizoen: randomSeizoen, aflevering: randomAflevering };
}

// haal 1 specifieke aflevering op van TMDB
async function fetchEpisode(apiKey) {
    let isGeldig = false;
    let afleveringData = null;

    // blijf proberen tot we een aflevering met een afbeelding hebben
    while (!isGeldig) {
        const { seizoen, aflevering } = getRandomEpisodeNumbers();
        const url = `https://api.themoviedb.org/3/tv/1668/season/${seizoen}/episode/${aflevering}?api_key=${apiKey}&language=en-US`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();

            // check of de aflevering een titel en afbeelding heeft
            if (data.name && data.still_path) {
                afleveringData = {
                    titel: data.name,
                    seizoen: seizoen,
                    afbeelding: `https://image.tmdb.org/t/p/w500${data.still_path}`
                };
                isGeldig = true;
            }
        } catch (error) {
            console.log("Aflevering ophalen mislukt, probeer opnieuw...");
        }
    }

    return afleveringData;
}

// hussel de lijst
function husselLijst(lijst) {
    return lijst.sort(() => Math.random() - 0.5);
}

// vragen genereren
// TYPE 1: plaatje met 4 titels (multiple choice)
export async function genereerVraagType1(apiKey) {
    // haal 4 afleveringen op (Promise.all zorgt dat ze tegelijk opgehaald worden)
    const afleveringen = await Promise.all([
        fetchEpisode(apiKey), fetchEpisode(apiKey), 
        fetchEpisode(apiKey), fetchEpisode(apiKey)
    ]);

    // de eerste aflevering is het juiste antwoord, de rest zijn afleiders
    const juisteAflevering = afleveringen[0]; 
    
    // haal alle titels op en hussel ze (juiste antwoord niet altijd op dezelfde plek)
    let alleTitels = afleveringen.map(a => a.titel);
    alleTitels = husselLijst(alleTitels); 

    // bouw de envelop voor deze vraag
    return {
        type: 'nieuwe_vraag',
        vraagSoort: 'mc_titels',
        afbeelding: juisteAflevering.afbeelding,
        opties: alleTitels,
        juisteAntwoord: juisteAflevering.titel
    };
}

// TYPE 2: titel met 4 plaatjes (multiple choice)
export async function genereerVraagType2(apiKey) {
    // haal weer 4 afleveringen op (tegelijkertijd)
    const afleveringen = await Promise.all([
        fetchEpisode(apiKey), fetchEpisode(apiKey), 
        fetchEpisode(apiKey), fetchEpisode(apiKey)
    ]);

    // aflevering 1 is juist
    const juisteAflevering = afleveringen[0];
    
    // haal alle plaatjes op en hussel ze
    let allePlaatjes = afleveringen.map(a => a.afbeelding);
    allePlaatjes = husselLijst(allePlaatjes);

    // bouw de envelop
    return {
        type: 'nieuwe_vraag',
        vraagSoort: 'mc_plaatjes',
        titel: juisteAflevering.titel,
        opties: allePlaatjes,
        juisteAntwoord: juisteAflevering.afbeelding
    };
}

// TYPE 3: raad het seizoen (open vraag)
export async function genereerVraagType3(apiKey) {
    // haal 1 aflevering op
    const aflevering = await fetchEpisode(apiKey); 

    // bouw de envelop (juiste antwoord = seizoen nummer als tekst)
    return {
        type: 'nieuwe_vraag',
        vraagSoort: 'open_seizoen',
        afbeelding: aflevering.afbeelding,
        titel: aflevering.titel,
        juisteAntwoord: aflevering.seizoen.toString()
    };
}