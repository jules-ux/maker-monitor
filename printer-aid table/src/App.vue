<template>
  <v-data-table :headers="headers" :items="items" :search="search" item-value="name">
    <template v-slot:top>
      <v-text-field v-model="search" class="pa-2" label="Search"></v-text-field>
    </template>

    <!-- Status kolom aanpassen om een groen of rood bolletje weer te geven -->
    <template v-slot:item.status="{ item }">
      <v-chip :color="item.status === 'Active print' ? 'green' : 'red'" 
              label 
              dark>
        <v-icon>{{ item.status === 'Active print' ? 'mdi-check-circle' : 'mdi-close-circle' }}</v-icon>
      </v-chip>
    </template>
  </v-data-table>
</template>

<script setup>
import { ref } from 'vue'
import PubNub from 'pubnub'

// Data voor tabel
const search = ref('')
const headers = ref([
  { title: 'First Name', align: 'start', key: 'namefirst' },
  { title: 'Last Name', align: 'end', key: 'namelast' },
  { title: 'Printer', align: 'end', key: 'printer' },
  { title: 'Email', align: 'end', key: 'email' },
  { title: 'Start Time', align: 'end', key: 'timestart' },
  { title: 'End Time', align: 'end', key: 'timeend' },
  { title: 'Print Time', align: 'end', key: 'timeprint' },
  { title: 'Date', align: 'end', key: 'date' },
  { title: 'Status', align: 'end', key: 'status' },
])

// Maak de items array leeg initialisatie, zodat deze pas gevuld wordt bij binnenkomst van een bericht
const items = ref([])

// PubNub configuratie
const pubnub = new PubNub({
  publishKey: 'pub-c-c99cf8bb-3a00-4f2c-a061-2f58c92b61ef',
  subscribeKey: 'sub-c-83e02d99-84e9-4b1a-afed-b953fe0c2141',
  userId: 'printer-aid', // Voeg hier een unieke userId toe
})

pubnub.subscribe({ channels: ['jobs'] })

pubnub.addListener({
  message: (event) => {
    const message = event.message
    const now = new Date()
    console.log(message)

    if (message === 'on') {
      // Wanneer de printer aan gaat, voeg een nieuw item toe
      items.value.push({
        namefirst: 'Unknown',
        namelast: 'Unknown',
        printer: message.printer,
        email: 'unknown@example.com',
        timestart: now.toLocaleTimeString(),
        timeend: null,
        timeprint: null,
        date: now.toLocaleDateString(),
        status: 'Active print',
      })

      // Print de starttijd en de datum in de console
      console.log('Start Time:', now.toLocaleTimeString())
      console.log('Date:', now.toLocaleDateString())

    } else if (message === 'off') {
      // Wanneer de printer uitgaat, update de eindtijd en bereken de printtijd
      const lastItem = items.value.find(item => item.status === 'Active print' && !item.timeend)

      if (lastItem) {
        lastItem.timeend = now.toLocaleTimeString()

        // Bereken de printtijd
        const startTime = new Date(`1970-01-01T${lastItem.timestart}`)
        const endTime = new Date(`1970-01-01T${lastItem.timeend}`)
        const diffMs = endTime - startTime
        const diffMinutes = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMinutes / 60)
        lastItem.timeprint = `${diffHours}h ${diffMinutes % 60}min`

        lastItem.status = 'Inactive'

        // Print de eindtijd en printtijd in de console
        console.log('End Time:', lastItem.timeend)
        console.log('Print Time:', lastItem.timeprint)
      }
    }
  },
})
</script>
