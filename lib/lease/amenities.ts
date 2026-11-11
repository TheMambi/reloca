// Curated amenity catalog for the destinations dialog.
//
// The schema stores `amenities` as a free-form `text[]`, so the catalog below
// is purely a UX scaffold — it gives the user a checkbox grid to compare
// buildings consistently without forcing them into a fixed enum. Anything
// they type into the "+ Add custom amenity" input lands in the same array.

export type AmenityCategory = {
  id: string;
  label: string;
  items: string[];
};

export const AMENITY_CATALOG: AmenityCategory[] = [
  {
    id: "in-unit",
    label: "IN-UNIT",
    items: [
      "In-unit washer & dryer",
      "Central A/C & heating",
      "Balcony or private patio",
      "Dishwasher",
      "Stainless steel appliances",
      "Walk-in closets",
      "Smart thermostat",
      "Keyless smart lock",
      "High-speed / fiber-ready",
    ],
  },
  {
    id: "community",
    label: "COMMUNITY & LEISURE",
    items: [
      "Fitness center",
      "Yoga / spin studio",
      "Pool",
      "Hot tub",
      "Rooftop deck",
      "BBQ grills",
      "Fire pits",
      "Resident lounge",
      "Game room",
      "Movie / screening room",
      "Co-working space",
      "Private meeting rooms",
    ],
  },
  {
    id: "convenience",
    label: "CONVENIENCE & SECURITY",
    items: [
      "Assigned parking",
      "Secure parking garage",
      "EV charging",
      "24/7 concierge",
      "Doorman",
      "Package room / Amazon Hub",
      "Elevators",
      "On-site maintenance",
      "Valet trash",
      "Trash chutes",
      "Controlled access (fob/biometric)",
      "Security cameras",
      "Secure bike storage",
    ],
  },
  {
    id: "pets",
    label: "PETS",
    items: [
      "On-site dog park",
      "Pet wash / grooming station",
      "Pet sitting / dog walking",
    ],
  },
];

// Flat lookup of catalog items for "is this amenity in the catalog vs custom?"
export const CATALOG_ITEM_SET = new Set(
  AMENITY_CATALOG.flatMap((c) => c.items),
);
