/**
 * Italian national public holidays (weekends are handled separately by the deadline engine).
 * Local patron-saint days are not included. Easter Monday: 6 April 2026, 29 March 2027.
 */
export const ITALIAN_HOLIDAYS: Array<{ date: string; name: string }> = [
  // 2026
  { date: "2026-01-01", name: "Capodanno" },
  { date: "2026-01-06", name: "Epifania" },
  { date: "2026-04-06", name: "Lunedì dell'Angelo (Pasquetta)" },
  { date: "2026-04-25", name: "Festa della Liberazione" },
  { date: "2026-05-01", name: "Festa dei Lavoratori" },
  { date: "2026-06-02", name: "Festa della Repubblica" },
  { date: "2026-08-15", name: "Assunzione (Ferragosto)" },
  { date: "2026-11-01", name: "Ognissanti" },
  { date: "2026-12-08", name: "Immacolata Concezione" },
  { date: "2026-12-25", name: "Natale" },
  { date: "2026-12-26", name: "Santo Stefano" },
  // 2027
  { date: "2027-01-01", name: "Capodanno" },
  { date: "2027-01-06", name: "Epifania" },
  { date: "2027-03-29", name: "Lunedì dell'Angelo (Pasquetta)" },
  { date: "2027-04-25", name: "Festa della Liberazione" },
  { date: "2027-05-01", name: "Festa dei Lavoratori" },
  { date: "2027-06-02", name: "Festa della Repubblica" },
  { date: "2027-08-15", name: "Assunzione (Ferragosto)" },
  { date: "2027-11-01", name: "Ognissanti" },
  { date: "2027-12-08", name: "Immacolata Concezione" },
  { date: "2027-12-25", name: "Natale" },
  { date: "2027-12-26", name: "Santo Stefano" },
];
