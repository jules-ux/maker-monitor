<template>
    <v-data-table :headers="headers" :items="items" :search="search" item-value="name" class="main">
        <!-- Status kolom met dynamische kleur en icoon -->
        <template v-slot:item.status="{ item }" class="pa-3">
            <v-chip :color="item.status === 'Active' ? 'green' : 'red'" label dark>
                {{ item.status }}
            </v-chip>
        </template>
    </v-data-table>
</template>



<script setup>
import { ref, onMounted } from 'vue';
import PubNub from 'pubnub';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, updateDoc, doc, onSnapshot } from "firebase/firestore";

// Firebase-configuratie
const firebaseConfig = {
    apiKey: "AIzaSyAIpUdHpSEk8ahMIO59T-BAx7n5_BcRYW4",
    authDomain: "printer-aid.firebaseapp.com",
    databaseURL: "https://printer-aid-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "printer-aid",
    storageBucket: "printer-aid.firebasestorage.app",
    messagingSenderId: "636113573034",
    appId: "1:636113573034:web:1476a0e2c26c595232acd3",
    measurementId: "G-BFZTJTGYRC"
};

// Initialiseer Firebase en Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Data voor de tabel
const search = ref('');
const headers = ref([
    { title: 'First Name', align: 'start', key: 'namefirst' },
    { title: 'Last Name', align: 'start', key: 'namelast' },
    { title: 'Printer', align: 'start', key: 'printer' },
    { title: 'Email', align: 'start', key: 'email' },
    { title: 'Start Time', align: 'start', key: 'timestart' },
    { title: 'End Time', align: 'start', key: 'timeend' },
    { title: 'Print Time', align: 'start', key: 'timeprint' },
    { title: 'Date', align: 'start', key: 'date' },
    { title: 'Status', align: 'start', key: 'status' },
]);
const items = ref([]);

// PubNub configuratie
const pubnub = new PubNub({
    publishKey: 'pub-c-c236d3b0-2075-4975-99e9-df52ffb60c17',
    subscribeKey: 'sub-c-d075a53f-dfe2-45ed-a501-76ab004cb9d7',
    userId: 'printer-aid',
});

// Vlag om te controleren of een print bezig is
let isPrinting = ref(false); // Gebruik een vlag om te voorkomen dat de volgende print automatisch start
let currentPrintId = ref(null); // Sla het ID op van de huidige print

// Functie om de Firestore-database te laden
async function loadItems() {
    const querySnapshot = await getDocs(collection(db, "prints"));
    items.value = [];
    querySnapshot.forEach((doc) => {
        items.value.push({ id: doc.id, ...doc.data() });
    });
}

// Abonneer je op updates van de Firestore-collectie
function listenForChanges() {
    const unsub = onSnapshot(collection(db, "prints"), (querySnapshot) => {
        items.value = [];
        querySnapshot.forEach((doc) => {
            items.value.push({ id: doc.id, ...doc.data() });
        });
    });

    // Dit zorgt ervoor dat de listener kan worden gestopt als dat nodig is
    return unsub;
}

// Laad items wanneer de pagina wordt geladen (herstart of voor de eerste keer)
onMounted(async () => {
    await loadItems();
    listenForChanges();
});

// PubNub configuratie en berichten afhandelen
pubnub.subscribe({ channels: ['jobs'] });
async function cleanupActivePrints() {
    // Haal alle actieve prints op uit de database
    const activePrintsSnapshot = await getDocs(query(collection(db, "prints"), where("status", "==", "Active")));

    // Als er meer dan 1 actieve print is, verwijder de extra prints
    if (activePrintsSnapshot.size > 1) {
        let counter = 0;
        activePrintsSnapshot.forEach(async (docSnap) => {
            if (counter > 0) { // De eerste actieve print bewaren
                const activePrint = docSnap.data();

                // Werk de status bij naar 'Inactive' voor de overtollige print
                try {
                    const docRef = doc(db, "prints", docSnap.id);
                    await updateDoc(docRef, {
                        status: 'Inactive', // Maak de print inactief
                    });
                } catch (error) {
                    console.error("Fout bij het bijwerken van document:", error);
                }
            }
            counter++;
        });
    }
}

// Controleer continu elke 5 seconden (of een andere gewenste interval)
setInterval(cleanupActivePrints, 5000);

// Luister naar berichten
pubnub.addListener({
    message: async (event) => {
        const message = event.message;
        const now = new Date();

        if (message === 'on' && !isPrinting.value) {
            // Als er geen print bezig is, start een nieuwe print
            isPrinting.value = true;

            // Stel een standaardprinter in
            const defaultPrinter = "Printer1"; // Standaardprinter voor 'on' berichten

            // Voeg een nieuw print-item toe
            const newItem = {
                namefirst: 'Unknown',
                namelast: 'Unknown',
                printer: defaultPrinter,  // Gebruik de standaardprinter
                email: 'unknown@example.com',
                timestart: now.toLocaleTimeString(),
                timeend: null,
                timeprint: null,
                date: now.toLocaleDateString(),
                status: 'Active',
            };

            items.value.push(newItem);

            try {
                const docRef = await addDoc(collection(db, "prints"), newItem);
                // Sla het ID van de nieuwe print op om het later bij te werken
                currentPrintId.value = docRef.id;
            } catch (error) {
                console.error("Fout bij het toevoegen van document:", error);
            }
        } else if (message === 'off' && isPrinting.value && currentPrintId.value) {
            // Als het 'off' bericht wordt ontvangen, beëindig de print en werk het juiste item bij
            const lastItem = items.value.find(item => item.id === currentPrintId.value && item.status === 'Active' && !item.timeend);

            if (lastItem) {
                lastItem.timeend = now.toLocaleTimeString();

                const startTime = new Date(`1970-01-01T${lastItem.timestart}`);
                const endTime = new Date(`1970-01-01T${lastItem.timeend}`);
                const diffMs = endTime - startTime;
                const diffMinutes = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMinutes / 60);
                lastItem.timeprint = `${diffHours}h ${diffMinutes % 60}min`;
                lastItem.status = 'Inactive';

                // Update Firestore document met hetzelfde ID
                try {
                    const docRef = doc(db, "prints", lastItem.id);
                    await updateDoc(docRef, {
                        timeend: lastItem.timeend,
                        timeprint: lastItem.timeprint,
                        status: lastItem.status,
                    });
                    console.log('Document geüpdatet met ID:', lastItem.id);
                } catch (error) {
                    console.error("Fout bij het updaten van document:", error);
                }

                // Reset de vlag om een nieuwe print te starten
                isPrinting.value = false;
                currentPrintId.value = null; // Reset het ID voor de volgende print
            }
        }
    },
});
</script>

<style scoped>
html,
body {
    margin: 0px;
    padding: 0;
    height: 100%;
}

.pa-2 {
    margin-inline: 12px;
}

.v-data-table-footer {
    margin-inline: 12px;
}

thead {
    background-color: #f9fafc;
}

tr>*>* {
    display: flex;
    justify-content: left;
    font-family: 'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif;
    font-weight: 900;
    font-size: 1.02rem;
    color: #5a5b5c
}

.v-data-table__tr>*>*>* {
    display: flex;
    flex-direction: row;
    justify-content: left;
}

.v-data-table__td {
    color: black;
    font-weight: 200;
}
</style>
