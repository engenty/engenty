import { describe, expect, it } from "vitest";
import { formatContactSnapshot } from "./contact-snapshot.js";

describe("formatContactSnapshot", () => {
  it("formats full contact data into recipient snapshot", () => {
    const contact = {
      id: "e1",
      display_name: "Acme Inc",
      address_street: "Main St 1",
      address_zip: "1010",
      address_city: "Vienna",
      address_country: "AT",
      email: "info@acme.at",
    } as any;
    const snapshot = formatContactSnapshot(contact);
    expect(snapshot.recipient_name).toBe("Acme Inc");
    expect(snapshot.recipient_address).toBe("Main St 1\n1010, Vienna, AT");
    expect(snapshot.recipient_email).toBe("info@acme.at");
  });

  it("handles minimal contact data", () => {
    const contact = {
      id: "e2",
      display_name: "Solo",
      address_street: null,
      address_zip: null,
      address_city: null,
      address_country: null,
      email: "",
    } as any;
    const snapshot = formatContactSnapshot(contact);
    expect(snapshot.recipient_name).toBe("Solo");
    expect(snapshot.recipient_address).toBe("");
    expect(snapshot.recipient_email).toBe("");
  });

  it("handles street-only address", () => {
    const contact = {
      id: "e3",
      display_name: "Street Co",
      address_street: "Only Street 5",
      address_zip: null,
      address_city: null,
      address_country: null,
      email: "contact@street.co",
    } as any;
    const snapshot = formatContactSnapshot(contact);
    expect(snapshot.recipient_address).toBe("Only Street 5");
  });

  it("handles location-only (zip, city, country)", () => {
    const contact = {
      id: "e4",
      display_name: "Location Co",
      address_street: null,
      address_zip: "5020",
      address_city: "Salzburg",
      address_country: "Austria",
      email: "",
    } as any;
    const snapshot = formatContactSnapshot(contact);
    expect(snapshot.recipient_address).toBe("5020, Salzburg, Austria");
  });
});
