export type OnboardingOption = {
  code: string;
  name: string;
};

export const countries: OnboardingOption[] = [
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "CH", name: "Switzerland" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "GR", name: "Greece" },
  { code: "HR", name: "Croatia" },
  { code: "HU", name: "Hungary" },
  { code: "IE", name: "Ireland" },
  { code: "IS", name: "Iceland" },
  { code: "IT", name: "Italy" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "LV", name: "Latvia" },
  { code: "MT", name: "Malta" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SE", name: "Sweden" },
  { code: "SI", name: "Slovenia" },
  { code: "SK", name: "Slovakia" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "US", name: "United States" },
];

export const currencies: OnboardingOption[] = [
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "Pound sterling" },
  { code: "CHF", name: "Swiss franc" },
  { code: "DKK", name: "Danish krone" },
  { code: "NOK", name: "Norwegian krone" },
  { code: "SEK", name: "Swedish krona" },
  { code: "PLN", name: "Polish zloty" },
  { code: "CZK", name: "Czech koruna" },
  { code: "HUF", name: "Hungarian forint" },
  { code: "TRY", name: "Turkish lira" },
  { code: "UAH", name: "Ukrainian hryvnia" },
  { code: "USD", name: "US dollar" },
  { code: "RUB", name: "Russian ruble" },
];

export const countryCurrency: Record<string, string> = {
  AT: "EUR", BE: "EUR", BG: "EUR", CY: "EUR", CZ: "CZK", DE: "EUR", DK: "DKK", EE: "EUR", ES: "EUR", FI: "EUR", FR: "EUR", GB: "GBP", GR: "EUR", HR: "EUR", HU: "HUF", IE: "EUR", IS: "EUR", IT: "EUR", LT: "EUR", LU: "EUR", LV: "EUR", MT: "EUR", NL: "EUR", NO: "NOK", PL: "PLN", PT: "EUR", RO: "EUR", RU: "RUB", SE: "SEK", SI: "EUR", SK: "EUR", TR: "TRY", UA: "UAH", US: "USD", CH: "CHF",
};

export const timezones = [
  "Europe/Amsterdam", "Europe/Athens", "Europe/Berlin", "Europe/Brussels", "Europe/Bucharest", "Europe/Copenhagen", "Europe/Helsinki", "Europe/Istanbul", "Europe/Kyiv", "Europe/Lisbon", "Europe/London", "Europe/Madrid", "Europe/Oslo", "Europe/Paris", "Europe/Prague", "Europe/Riga", "Europe/Rome", "Europe/Stockholm", "Europe/Tallinn", "Europe/Vienna", "Europe/Vilnius", "Europe/Warsaw", "Europe/Zurich", "Asia/Nicosia", "Asia/Tbilisi", "Asia/Yerevan", "America/New_York", "America/Los_Angeles", "UTC",
];
