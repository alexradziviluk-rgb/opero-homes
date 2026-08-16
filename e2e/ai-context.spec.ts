import { expect, test } from "@playwright/test";
import { patchHousingSearchContext } from "../lib/ai/housing-context";

test.describe("Opero AI housing context", () => {
  test("patches partial date updates without dropping guests", () => {
    const initial = patchHousingSearchContext(undefined, "20 по 25 августа", "ru");
    const withGuests = patchHousingSearchContext(initial, "2 взрослых", "ru");
    const updated = patchHousingSearchContext(withGuests, "А если с 21 августа?", "ru");

    expect(updated).toMatchObject({ checkIn: `${new Date().getFullYear()}-08-21`, checkOut: `${new Date().getFullYear()}-08-25`, guests: 2 });
  });

  test("retains budget and preferences across later search turns", () => {
    const initial = patchHousingSearchContext(undefined, "20 по 25 августа, 2 взрослых, до 150 евро в Аланье", "ru");
    const cheaper = patchHousingSearchContext(initial, "Покажи дешевле", "ru");
    const nearSea = patchHousingSearchContext(cheaper, "Хочу ближе к морю", "ru");

    expect(nearSea).toMatchObject({ maxPrice: 150, location: "Аланье", checkIn: initial.checkIn, checkOut: initial.checkOut, guests: 2 });
    expect(nearSea.preferences).toEqual(["cheaper", "near_sea"]);
  });

  test("keeps each conversation language deterministic", () => {
    expect(patchHousingSearchContext(undefined, "Find accommodation", "en").language).toBe("en");
    expect(patchHousingSearchContext(undefined, "Konut bul", "tr").language).toBe("tr");
    expect(patchHousingSearchContext({ language: "en" }, "What about 21 August?", "ru").language).toBe("ru");
  });
});