<div align="center">

### Sveučilište Jurja Dobrile u Puli
### Fakultet informatike

<br><br>

## ALEN ORBANIĆ

## Razvoj web-aplikacije za razmjenu poruka u stvarnom vremenu primjenom hibridne P2P arhitekture

### Završni rad

<br><br>

| | |
|---|---|
| **JMBAG:** | 0303094982 |
| **Studijski smjer:** | preddiplomski studij informatike |
| **Kolegij:** | Raspodijeljeni sustavi |
| **Znanstveno područje:** | Društvene znanosti |
| **Znanstveno polje:** | Informacijske znanosti |
| **Znanstvena grana:** | Informacijski sustavi i informatologija |
| **Mentor:** | izv. prof. dr. sc. Nikola Tanković |

<br><br>

**Pula, rujan 2026.**

</div>

---

# Brzojav Backend

Ovaj repozitorij sadrži backend server za Brzojav, web-aplikaciju za razmjenu poruka u stvarnom vremenu.

Backend pruža REST API, autentikaciju, pristup bazi podataka, prijenos datoteka, obavijesti u stvarnom vremenu i WebRTC signalizaciju.

## Frontend

Repozitorij frontenda dostupan je ovdje:

[Brzojav](https://github.com/AlenOrbanic/Brzojav)

## Tehnologije

- **Node.js** – JavaScript runtime okruženje
- **Express** – HTTP server i REST API
- **MongoDB** – baza podataka
- **Mongoose** – objektno modeliranje za MongoDB
- **Socket.IO** – komunikacija u stvarnom vremenu i WebRTC signalizacija
- **JWT** – autentikacija
- **bcryptjs** – hashiranje lozinki
- **Google Auth Library** – Google autentikacija
- **Cloudinary** – pohrana multimedijalnih datoteka
- **Multer** – obrada multipart datoteka
- **streamifier** – pretvaranje prenesenih buffera u streamove
- **Helmet** – sigurnosna HTTP zaglavlja
- **CORS** – dijeljenje resursa različitog podrijetla (cross-origin resource sharing)
- **express-rate-limit** – ograničavanje broja zahtjeva
- **node-fetch** – HTTP zahtjevi između backend čvorova i vanjskih servisa

Ove ovisnosti definirane su u backendovom `package.json`.

## Značajke

- Registracija i prijava korisnika
- Google autentikacija
- JWT autentikacija
- Upravljanje korisničkim profilom
- Promjena lozinke
- Blokiranje korisnika
- Brisanje računa
- Razgovori jedan na jedan
- Grupni razgovori
- Pohrana poruka
- Brisanje poruka
- Reakcije na poruke
- Pribadanje (pinanje) poruka
- Prijenos datoteka
- Prijenos slika i videozapisa
- Pregledi poveznica (link previews)
- Obavijesti u stvarnom vremenu
- WebRTC signalizacija
- Praćenje online korisnika
- Pronalaženje korisnika (peer lookup)
- Više backend čvorova
- Gossip sinkronizacija između čvorova
- Automatsko uklanjanje neaktivnih zapisa o korisnicima
- Sigurnosna zaglavlja
- Ograničavanje broja zahtjeva
- Zaštita od NoSQL injekcija

## Struktura projekta

```text
Brzojav-backend/
├── middleware/
│   ├── auth.js             # JWT autentikacijski middleware
│   └── upload.js           # Obrada prijenosa datoteka
│
├── models/
│   ├── Chat.js             # Model razgovora
│   ├── Message.js          # Model poruke
│   ├── User.js             # Model korisnika
│   └── UserChat.js         # Odnos korisnik–razgovor
│
├── routes/
│   ├── auth.js             # Autentikacija i upravljanje računom
│   ├── chats.js            # Upravljanje razgovorima i grupama
│   ├── links.js            # Obrada pregleda poveznica
│   ├── lookup.js           # Pronalaženje korisnika/čvorova
│   ├── messages.js         # Operacije nad porukama
│   ├── sync.js             # Sinkronizacija između čvorova
│   └── users.js            # Registracija online korisnika
│
├── cloudinary.js            # Cloudinary konfiguracija
├── db.js                    # MongoDB konekcija
├── gossip.js                # Gossip sinkronizacija
├── index.js                 # Ulazna točka servera
├── peers.js                 # Konfiguracija seed čvorova
├── registry.js              # Registar korisnika u memoriji
├── package.json
└── README.md
```

Repozitorij sadrži zasebne module za bazu podataka, registar korisnika, gossip sinkronizaciju, funkcionalnost servera vezanu uz WebRTC, rute, middleware i modele baze podataka.

## Instalacija

### Preduvjeti

Provjerite je li sljedeće instalirano i dostupno:

- [Node.js](https://nodejs.org/)
- npm
- MongoDB baza podataka
- Cloudinary račun
- Google OAuth klijent, ako je omogućena Google autentikacija

### Kloniranje repozitorija

```bash
git clone https://github.com/AlenOrbanic/Brzojav-backend.git
cd Brzojav-backend
```

### Instalacija ovisnosti

```bash
npm install
```

## Varijable okoline

Backend zahtijeva varijable okoline za pristup bazi podataka, autentikaciju, Cloudinary i konfiguraciju više čvorova.

Kreirajte `.env` datoteku:

```env
PORT=3001

MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

GOOGLE_CLIENT_ID=your_google_client_id

NODE_ID=seed-1
NODE_SECRET=your_shared_node_secret

SELF_URL=http://localhost:3001

SEED_1_URL=http://localhost:3001
SEED_2_URL=http://localhost:3002
SEED_3_URL=http://localhost:3003

GOSSIP_INTERVAL_MS=30000

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

**Nemojte commitati `.env` datoteke ili stvarne vjerodajnice u Git.**

MongoDB konekcija se uspostavlja korištenjem `MONGODB_URI`, dok autentikacija zahtijeva `JWT_SECRET`. Server također koristi `GOOGLE_CLIENT_ID` za Google autentikaciju.

Točni nazivi Cloudinary varijabli okoline moraju odgovarati onima korištenima u Cloudinary konfiguraciji u `cloudinary.js`.

## Pokretanje backenda

### Jedan čvor

Za pokretanje jednog backend čvora:

```bash
npm start
```

Zadani port je `3000` ako `PORT` nije naveden.

### Klaster od tri čvora

Backend podržava pokretanje tri seed čvora.

Dostupne npm skripte su:

```bash
npm run node1
npm run node2
npm run node3
```

Za istovremeno pokretanje sva tri čvora:

```bash
npm run cluster
```

Tri čvora koriste zasebne datoteke okoline:

```text
.env
.env.node2
.env.node3
```

Skripte definirane u `package.json` pokreću svaki čvor s pripadajućom konfiguracijom okoline.

## Arhitektura backenda

Brzojav koristi hibridnu arhitekturu koja se sastoji od REST API-ja, Socket.IO-a, WebRTC-a i MongoDB-a.

Korisnici komuniciraju s backendom putem REST API-ja i Socket.IO-a. Kada je to moguće, poruke i datoteke se naknadno mogu prenositi izravno između korisnika putem WebRTC-a.

## REST API

Backend izlaže nekoliko grupa REST endpointa.

### Autentikacija

```text
/api/auth
```

Obuhvaća:

- registraciju
- prijavu
- Google autentikaciju
- dohvaćanje trenutnog korisnika
- ažuriranje profila
- promjenu lozinke
- blokiranje korisnika
- brisanje računa

JWT tokeni generiraju se prilikom autentikacije i vrijede sedam dana. Lozinke se prije pohrane hashiraju pomoću bcrypta.

### Korisnici

```text
/api/users
```

Omogućuje funkcionalnost za:

- registraciju online korisnika
- slanje heartbeat signala
- odjavu
- održavanje registra korisnika

Registar pohranjuje informacije poput korisničkog imena, IP adrese, P2P porta, ID-a čvora i vremena posljednje aktivnosti.

### Razgovori

```text
/api/chats
```

Obuhvaća:

- dohvaćanje razgovora
- kreiranje izravnih razgovora
- kreiranje grupa
- ažuriranje grupa
- napuštanje grupa
- uklanjanje članova
- označavanje razgovora kao pročitanih
- pribadanje poruka

### Poruke

```text
/api/Messages
```

Obuhvaća:

- dohvaćanje povijesti poruka
- slanje poruka
- prijenos datoteka
- brisanje poruka
- dodavanje reakcija
- uklanjanje reakcija

Povijest poruka pohranjuje se u MongoDB. Prenesene datoteke se šalju na Cloudinary, dok se dobiveni URL-ovi pohranjuju uz poruku.

### Pregledi poveznica

```text
/api/links
```

Pruža metapodatke za URL-ove poslane putem aplikacije.

## Autentikacija

Zaštićeni endpointi zahtijevaju JWT pristupni token.

Token se prosljeđuje putem HTTP `Authorization` zaglavlja:

```http
Authorization: Bearer <token>
```

Autentikacijski middleware provjerava valjanost tokena i čini autenticirano korisničko ime dostupnim route handlerima.

Backend također primjenjuje ograničavanje broja zahtjeva (rate limiting) na endpointima za registraciju i prijavu kako bi smanjio pokušaje brute-force napada i automatiziranog kreiranja računa.

## Komunikacija u stvarnom vremenu

Socket.IO se koristi za događaje u stvarnom vremenu između frontenda i backenda.

Backend održava mapu trenutno povezanih korisnika:

```text
korisničko ime → Socket.IO socket ID
```

Ovo serveru omogućuje slanje obavijesti određenim korisnicima.

Primjeri događaja u stvarnom vremenu:

```text
new_message
chat_updated
chat_pinned
reactions_updated
webrtc-signal
```

Backend koristi Socket.IO za WebRTC signalizaciju i obavijesti, a ne kao primarni prijenosni kanal za sadržaj peer-to-peer poruka.

## WebRTC signalizacija

Backend pruža signalizacijski sloj potreban za uspostavu WebRTC veza.

Kada klijent želi uspostaviti vezu s drugim korisnikom:

1. Klijent dohvaća informacije o drugom korisniku (peer lookup).
2. Kreira se WebRTC veza.
3. Generiraju se SDP i ICE informacije.
4. Signalizacijske informacije šalju se putem Socket.IO-a.
5. Backend prosljeđuje signalizacijske podatke odredišnom korisniku.
6. Preglednici uspostavljaju WebRTC DataChannel.
7. Podaci se zatim mogu prenositi izravno između korisnika.

Backend ne pregledava stvarni sadržaj koji se prenosi putem WebRTC DataChannela.

## Prijenos datoteka

Datoteke prenesene putem REST API-ja obrađuju se korištenjem Multera.

Backend ih zatim prenosi na Cloudinary.

Ovisno o MIME tipu, datoteke se kategoriziraju kao:

- slike
- videozapisi
- ostale datoteke

Dobiveni Cloudinary URL pohranjuje se uz poruku u MongoDB.

## Sigurnost

Backend uključuje nekoliko sigurnosnih mjera:

- Helmet sigurnosna zaglavlja
- JWT autentikacija
- bcrypt hashiranje lozinki
- ograničavanje broja pokušaja prijave
- ograničavanje broja pokušaja registracije
- CORS
- filtriranje NoSQL operatora
- zaštićena sinkronizacija između čvorova
- autenticirane Socket.IO konekcije
- centralizirano rukovanje greškama

Zahtjevi koji sadrže MongoDB operatore poput `$` ili ključeve koji sadrže `.` filtriraju se prije nego dosegnu logiku aplikacije.

## Dostupne skripte

| Naredba           | Opis                              |
| ----------------- | ---------------------------------- |
| `npm install`     | Instalira ovisnosti                |
| `npm start`       | Pokreće backend                    |
| `npm run dev`     | Pokreće backend koristeći Nodemon  |
| `npm run node1`   | Pokreće seed čvor 1                |
| `npm run node2`   | Pokreće seed čvor 2                |
| `npm run node3`   | Pokreće seed čvor 3                |
| `npm run cluster` | Pokreće sva tri seed čvora         |

Ove skripte definirane su u `package.json` repozitorija.

## Postavljanje u produkciju (deployment)

Backend se može postaviti na hosting servis kompatibilan s Node.js-om.

Prilikom postavljanja više čvorova, svaki čvor treba imati svoj:

- `PORT`
- `NODE_ID`
- `SELF_URL`
- konfiguraciju seed čvorova

Svi čvorovi moraju dijeliti isti:

- MongoDB bazu podataka
- `NODE_SECRET`

Frontend također mora biti konfiguriran da koristi postavljeni (deployani) URL backenda.

### ! Važno !
_peers.js, gossip.js i registry.js se ne koriste u aplikaciji. Ostavljeni su za slučaj izrade desktop verzije aplikacije._

## Povezani repozitorij

Frontend:

[https://github.com/AlenOrbanic/Brzojav](https://github.com/AlenOrbanic/Brzojav)
