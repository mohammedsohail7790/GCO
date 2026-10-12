// The fictional clients of the STAGING environment. Three deliberately different operations so the owner can test that several
// clients run side by side with separate teams, languages, SLAs, capacity and opening hours. Everything here is invented.
// NOTE (honest scope): the operator workspace does not yet change per service type; the clients differ in configuration
// (team, languages, SLA, capacity, hours), not in the tools shown. That is one of the things this environment exists to evaluate.

export interface StagingClient {
  key: string
  name: string
  service: string
  slug: string
  sla: number
  capacity: number
  timezone: string
  hours: Record<string, { open: string; close: string }> | null
  operators: { name: string; languages: string[]; online: boolean }[]
  /** Sample inbound customer messages for the simulator, by language. */
  samples: { lang: string; customer: string; text: string }[]
}

const weekdays = (open: string, close: string) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, { open, close }]))
const everyday = (open: string, close: string) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open, close }]))

export const STAGING_CLIENTS: readonly StagingClient[] = [
  {
    key: 'aurora', name: 'Aurora Retail (staging)', service: 'Customer support for an online shop', slug: 'staging-aurora',
    sla: 120, capacity: 3, timezone: 'Europe/Rome', hours: weekdays('08:00', '20:00'),
    operators: [
      { name: 'Giulia Ferri', languages: ['it', 'en'], online: true },
      { name: 'Hannah Vogel', languages: ['de', 'en'], online: false },
      { name: 'Carmen Ruiz', languages: ['es', 'fr'], online: false },
    ],
    samples: [
      { lang: 'en', customer: 'Oliver Grant', text: 'Hi, my order #A1042 has not arrived yet. Can you tell me where it is?' },
      { lang: 'it', customer: 'Marta Colombo', text: 'Buongiorno, vorrei restituire un paio di scarpe. Come posso fare?' },
      { lang: 'de', customer: 'Jonas Becker', text: 'Hallo, ich wurde doppelt belastet. Bitte um Rückerstattung.' },
      { lang: 'es', customer: 'Lucía Navarro', text: 'Hola, ¿puedo cambiar la dirección de entrega de mi pedido?' },
      { lang: 'fr', customer: 'Élodie Martin', text: "Bonjour, l'article reçu ne correspond pas à ma commande." },
    ],
  },
  {
    key: 'pixelarena', name: 'Pixel Arena (staging)', service: 'Chat moderation for an online game', slug: 'staging-pixelarena',
    sla: 60, capacity: 4, timezone: 'UTC', hours: null,
    operators: [
      { name: 'Erik Lindqvist', languages: ['sv', 'en'], online: true },
      { name: 'Mia Hoffmann', languages: ['de', 'en'], online: true },
      { name: 'Tom Walsh', languages: ['en'], online: false },
    ],
    samples: [
      { lang: 'en', customer: 'player_4821', text: 'Reported: a player in global chat keeps spamming links to a gold-selling site.' },
      { lang: 'sv', customer: 'spelare_77', text: 'Rapport: någon kallar andra spelare fula namn i lagchatten.' },
      { lang: 'de', customer: 'spieler_310', text: 'Meldung: Ein Spieler beleidigt dauernd andere im Allgemeinchat.' },
      { lang: 'en', customer: 'player_9915', text: 'I think my account was banned by mistake. I only joined the match.' },
    ],
  },
  {
    key: 'harbor', name: 'Harbor Community (staging)', service: 'Community moderation with a dedicated team', slug: 'staging-harbor',
    sla: 300, capacity: 2, timezone: 'Europe/Paris', hours: everyday('10:00', '22:00'),
    operators: [
      { name: 'Chiara Rinaldi', languages: ['it', 'fr'], online: true },
      { name: 'Antoine Leclerc', languages: ['fr', 'en'], online: false },
      { name: 'Sara Nilsson', languages: ['sv', 'en'], online: false },
    ],
    samples: [
      { lang: 'it', customer: 'utente_204', text: 'Segnalazione: un post nel forum contiene dati personali di un altro membro.' },
      { lang: 'fr', customer: 'membre_88', text: "Signalement : un commentaire sous mon message est agressif et hors sujet." },
      { lang: 'en', customer: 'member_3057', text: 'Please review: this thread has turned into an argument and needs a moderator.' },
      { lang: 'sv', customer: 'medlem_41', text: 'Kan ni ta bort mitt inlägg? Jag la av misstag in mitt telefonnummer.' },
    ],
  },
] as const
