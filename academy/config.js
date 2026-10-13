// Ρυθμίσεις Academy — συμπληρώστε από Supabase → Project Settings → API.
// Το "anon public" κλειδί ΕΙΝΑΙ δημόσιο εκ σχεδιασμού (την ασφάλεια την κάνει το RLS).
// ΠΟΤΕ μην βάλετε εδώ το "service_role" κλειδί.
window.ACADEMY_CONFIG = {
  supabaseUrl: 'https://xxxx.supabase.co',          // π.χ. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: 'το-κλειδί',      // το "anon public" κλειδί
  siteUrl: '../',           // πού βρίσκονται οι προσομοιώσεις
  youtube: 'https://www.youtube.com/@coolingsystemslab',
  facebook: 'https://www.facebook.com/CoolingSystemsLab',
  // Έτοιμες λειτουργίες, κλειστές προς το παρόν. Για ενεργοποίηση: true.
  features: {
    assignments: false,     // εργασίες, υποβολές, βαθμολόγηση, βαθμολόγιο CSV
    announcements: false,   // ανακοινώσεις τμήματος
    messages: false         // ιδιωτικά μηνύματα σπουδαστή–εκπαιδευτή
  }
};
