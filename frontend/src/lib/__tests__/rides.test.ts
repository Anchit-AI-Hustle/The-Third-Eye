import { describe, expect, it } from "vitest";
import { rideLinks } from "@/lib/rides";

const drop = { lat: 28.5562, lng: 77.1, name: "Indira Gandhi International Airport", address: "IGI Airport, New Delhi" };
const pickup = { lat: 28.6139, lng: 77.209, name: "Connaught Place" };

describe("rideLinks", () => {
  it("opens Uber with the drop filled in, from the current location by default", () => {
    const [uber] = rideLinks(["uber"], drop);
    const u = new URL(uber.url);
    expect(u.origin + u.pathname).toBe("https://m.uber.com/ul/");
    expect(u.searchParams.get("action")).toBe("setPickup");
    expect(u.searchParams.get("pickup")).toBe("my_location");
    expect(u.searchParams.get("dropoff[latitude]")).toBe("28.5562");
    expect(u.searchParams.get("dropoff[longitude]")).toBe("77.1");
    expect(u.searchParams.get("dropoff[nickname]")).toBe(drop.name);
    expect(uber.prefilled).toBe(true);
  });

  it("uses a named pickup for Uber when one is given", () => {
    const u = new URL(rideLinks(["uber"], drop, pickup)[0].url);
    expect(u.searchParams.get("pickup")).toBeNull();
    expect(u.searchParams.get("pickup[latitude]")).toBe("28.6139");
    expect(u.searchParams.get("pickup[nickname]")).toBe("Connaught Place");
  });

  it("prefills Ola only with an affiliate token and a known pickup, else just opens Ola", () => {
    expect(rideLinks(["ola"], drop, pickup)[0]).toMatchObject({ url: "https://book.olacabs.com/", prefilled: false });
    expect(rideLinks(["ola"], drop, undefined, "tok")[0].prefilled).toBe(false);
    const ola = rideLinks(["ola"], drop, pickup, "tok")[0];
    const u = new URL(ola.url);
    expect(ola.prefilled).toBe(true);
    expect([u.searchParams.get("lat"), u.searchParams.get("drop_lat"), u.searchParams.get("utm_source")]).toEqual(["28.6139", "28.5562", "tok"]);
  });

  it("opens Rapido without a destination, since it publishes no booking link", () => {
    expect(rideLinks(["rapido"], drop)[0]).toMatchObject({ url: "https://www.rapido.bike/", prefilled: false });
  });

  it("returns one link per service in the order asked", () => {
    expect(rideLinks(["rapido", "uber", "ola"], drop).map((l) => l.service)).toEqual(["rapido", "uber", "ola"]);
  });
});
