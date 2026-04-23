// import web socket api 
import {
    WebSocketServer
} from 'ws';

// import dotenv om api key veilig te gebruiken (server.js kent .env bestand niet > dotenv zorgt ervoor dat server.js ook toegang heeft tot de variabelen in .env)
import dotenv from 'dotenv';

// import vraag generator functies
import {
    genereerVraagType1,
    genereerVraagType2,
    genereerVraagType3
} from './vragenGenerator.js';

// zet de variabelen uit .env bestand klaar voor gebruik in deze file
dotenv.config();
const apiKey = process.env.TMDB_API_KEY;

let huidigJuistAntwoord = "";

const server = new WebSocketServer({
    port: 8081
});

const clients = new Set();

// lege lijst voor de spelers, en een object om hun scores bij te houden
let spelers = [];
let huidigeVraagNummer = 0;
const MAX_VRAGEN = 5;
let scores = {};
let aantalAntwoorden = 0;
let correcteIndex = 0;
let vraagTimer;
let spelersDieGeantwoordHebben = new Set();

server.on('connection', (socket) => {
    clients.add(socket);
    console.log('Client connected');

    socket.on('message', async (message) => {
        const binnenkomendeTekst = message.toString();
        console.log(`Ontvangen op server: ${binnenkomendeTekst}`);

        try {
            // envelop uitpakken
            const envelop = JSON.parse(binnenkomendeTekst);
            console.log(`Envelop ontvangen: ${JSON.stringify(envelop)}`);

            // type checken
            if (envelop.type === 'nieuwe_speler') {

                // .trim verwijdert spaties voor en na de naam
                const gekozenNaam = envelop.naam.trim();

                // checken of de naam niet leeg is
                if (gekozenNaam === '') {
                    socket.send(JSON.stringify({
                        type: 'login_fout',
                        bericht: 'Naam mag niet leeg zijn!'
                    }));
                    return;
                }

                // checken of de naam al in gebruik is
                if (spelers.includes(gekozenNaam)) {
                    socket.send(JSON.stringify({
                        type: 'login_fout',
                        bericht: 'Deze naam is al in gebruik, kies een andere!'
                    }));
                    return;
                }

                // als naam is goedgekeurd, speler toevoegen aan de lijst
                console.log(`Nieuwe speler toegevoegd: ${gekozenNaam}`);
                spelers.push(gekozenNaam);
                scores[gekozenNaam] = 0; // startscore is 0
                socket.spelerNaam = gekozenNaam; // naam opslaan in socket

                socket.send(JSON.stringify({
                    type: 'login_succes'
                }));

                // geupdatete lijst in nieuwe envelop stoppen
                const updateEnvelop = JSON.stringify({
                    type: 'spelers_update',
                    spelerLijst: spelers
                });
                clients.forEach((client) => {
                    if (client.readyState === 1) client.send(updateEnvelop);
                });
            } else if (envelop.type === 'host_bericht') {
                console.log(`Bericht van de host ontvangen: ${envelop.tekst}`);
            } else if (envelop.type === 'start_game') {
                // Stop een eventuele vorige timer
                clearTimeout(vraagTimer);

                // tel 1 vraag op
                huidigeVraagNummer++;

                console.log(`Vraag ${huidigeVraagNummer} van de ${MAX_VRAGEN} gestart`)
                console.log('De host heeft het spel gestart!');

                // kies random getal 1-3
                const randomType = Math.floor(Math.random() * 3) + 1;
                let nieuweVraag;

                // roep de juiste vraag generator aan op basis van het random getal
                if (randomType === 1) nieuweVraag = await genereerVraagType1(apiKey);
                else if (randomType === 2) nieuweVraag = await genereerVraagType2(apiKey);
                else nieuweVraag = await genereerVraagType3(apiKey);

                // bewaar het antwoord op de server
                huidigJuistAntwoord = nieuweVraag.juisteAntwoord;

                // vind de index van het juiste antwoord
                if (nieuweVraag.opties) {
                    correcteIndex = nieuweVraag.opties.indexOf(huidigJuistAntwoord);
                } else {
                    correcteIndex = null; // voor open vragen is er geen index
                }

                // reset gegeven antwoorden van de vorige vraag
                aantalAntwoorden = 0;
                spelersDieGeantwoordHebben.clear();

                // verwijder antwoord uit de envelop voordat het naar de spelers gestuurd wordt
                delete nieuweVraag.juisteAntwoord;

                // neem huidige vraag nummer en max aantal vragen mee
                const startEnvelop = JSON.stringify({
                    ...nieuweVraag,
                    vraagNummer: huidigeVraagNummer,
                    totaalVragen: MAX_VRAGEN
                });

                clients.forEach((client) => {
                    if (client.readyState === 1) client.send(startEnvelop);
                });

                // vraagtimer
                vraagTimer = setTimeout(() => {
                    console.log('Tijd is om!');
                    stuurUitslag();
                }, 20000);
            } else if (envelop.type === 'naar_eindscore') {
                console.log('Host heeft eindscore aangevraagd!');

                const eindEnvelop = JSON.stringify({
                    type: 'eindscore',
                    scores: scores
                });

                clients.forEach((client) => {
                    if (client.readyState === 1) client.send(eindEnvelop);
                });

                // reset vragenteller
                huidigeVraagNummer = 0;
            } else if (envelop.type === 'speler_antwoord') {
                // check of deze speler al in het lijstje met geantwoorde spelers staat
                if (spelersDieGeantwoordHebben.has(socket.spelerNaam)) {
                    console.log(`${socket.spelerNaam} probeerde dubbel te klikken. Genegeerd!`);
                    return;
                }

                // zet speler op het lijstje zodat hij niet nog een keer mag
                spelersDieGeantwoordHebben.add(socket.spelerNaam);

                // tel het aantal antwoorden dat binnenkomt
                aantalAntwoorden++;

                // VOEG DEZE REGELS TOE VOOR DEBUGGING:
                console.log("--- DEBUG STATUS ---");
                console.log(`Aantal antwoorden ontvangen: ${aantalAntwoorden}`);
                console.log(`Aantal spelers in lijst (spelers.length): ${spelers.length}`);
                console.log(`Huidige spelerslijst:`, spelers);
                console.log("--------------------");

                // check of het antwoord klopt
                // const isGoed = (envelop.gekozenIndex === correcteIndex);

                let isGoed = false;

                // checken of het een multiple choice vraag is (met opties) of een open vraag
                if (envelop.gekozenIndex !== undefined) {
                    isGoed = (envelop.gekozenIndex === correcteIndex);
                } else if (envelop.gekozenAntwoord !== undefined) {
                    // voor open vragen vergelijken we de tekst (om hoofdlettergebruik en spaties heen)
                    const gegevenAntwoord = envelop.gekozenAntwoord.trim().toLowerCase();
                    const juistAntwoord = huidigJuistAntwoord.trim().toLowerCase();
                    isGoed = (gegevenAntwoord === juistAntwoord);
                }

                if (isGoed) {
                    // verhoog score met 100 punten
                    scores[socket.spelerNaam] += 100;
                }

                // sla op dat deze speler het goed had
                socket.laatsteAntwoordGoed = isGoed;

                // check of alle spelers hebben geantwoord
                if (aantalAntwoorden === spelers.length) {
                    console.log('Alle spelers hebben geantwoord!');
                    stuurUitslag();
                }
            } else if (envelop.type == 'terug_naar_lobby') {
                console.log('De host brengt iedereen terug naar de lobby');
                
                // reset spelgegevens
                huidigeVraagNummer = 0;
                aantalAntwoorden = 0;
                spelersDieGeantwoordHebben.clear();
                
                // zet alle scores op 0
                spelers.forEach(naam => {
                    scores[naam] = 0;
                });

                // zeg dat iedereen naar de lobby moet
                const lobbyEnvelop = JSON.stringify({
                    type: 'ga_naar_lobby',
                    spelerLijst: spelers 
                })

                clients.forEach((client) => {
                    if (client.readyState === 1) client.send(lobbyEnvelop);
                });
            } else if (envelop.type === 'vraag_tussenstand') {
                console.log('De host laat de tussenstand zien');
                
                const tussenstandEnvelop = JSON.stringify({
                    type: 'tussenstand',
                    scores: scores
                });

                clients.forEach((client) => {
                    if (client.readyState === 1) client.send(tussenstandEnvelop);
                });
            }

        } catch (error) {
            console.error(`Kan envelop niet lezen: ${binnenkomendeTekst}`);
        }
    });

    socket.on('close', () => {
        clients.delete(socket);

        // check of deze verbinding een naamkaartje had (dus of het een speler was)
        if (socket.spelerNaam) {
            console.log(`${socket.spelerNaam} heeft het spel verlaten!`);

            // haal de speler uit de array
            // '.filter' maakt een nieuwe lijst met iedereen behalve deze speler
            spelers = spelers.filter((naam) => naam !== socket.spelerNaam);

            // maak een envelop met de nieuwe, kortere lijst
            const updateEnvelop = JSON.stringify({
                type: 'spelers_update',
                spelerLijst: spelers
            });

            // stuur de nieuwe lijst
            clients.forEach((client) => {
                if (client.readyState === 1) client.send(updateEnvelop);
            });
        } else {
            console.log('Een onbekende client (bijv. de host) is vertrokken.');
        }
    });

    socket.on('error', (error) => {
        console.error(`Socket error: ${error.message}`);
    });
});

function stuurUitslag() {
    clearTimeout(vraagTimer);

    // checken of het de laatste vraag is
    const isLaatsteVraag = (huidigeVraagNummer >= MAX_VRAGEN);

    // stuur iedereen de uitslag van deze vraag
    clients.forEach((client) => {
        if (client.readyState === 1) {
            if (!client.spelerNaam) {
                client.send(JSON.stringify({
                    type: 'ronde_uitslag_host',
                    juisteIndex: correcteIndex,
                    juisteAntwoord: huidigJuistAntwoord,
                    scores: scores,
                    isLaatsteVraag: isLaatsteVraag
                }));
            } else {
                client.send(JSON.stringify({
                    type: 'ronde_uitslag_speler',
                    isGoed: client.laatsteAntwoordGoed,
                    jouwScore: scores[client.spelerNaam],
                    juisteAntwoord: huidigJuistAntwoord
                }));
            }
        }
    });
}



console.log('WebSocket server is running on ws://localhost:8081');