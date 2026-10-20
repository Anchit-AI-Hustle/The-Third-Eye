// Cab booking hand-off. Uber, Ola and Rapido give a personal app no booking
// API (Ola's is invite-only, Rapido has none, Uber's ride requests need
// partner approval), so the assistant opens the rider's own app with the trip
// filled in where the service publishes a way to, and the rider picks the
// ride type and confirms the fare there.

export type RideService = "uber" | "ola" | "rapido";
export const RIDE_SERVICES: RideService[] = ["uber", "ola", "rapido"];

export interface Place { lat: number; lng: number; name: string; address?: string }
export interface RideLink { service: RideService; url: string; label: string; prefilled: boolean }

const NAMES: Record<RideService, string> = { uber: "Uber", ola: "Ola", rapido: "Rapido" };

// developer.uber.com/docs/deep-linking (setPickup)
function uber(drop: Place, pickup?: Place): string {
  const q = new URLSearchParams({ action: "setPickup" });
  if (pickup) {
    q.set("pickup[latitude]", String(pickup.lat));
    q.set("pickup[longitude]", String(pickup.lng));
    q.set("pickup[nickname]", pickup.name);
  } else {
    q.set("pickup", "my_location");
  }
  q.set("dropoff[latitude]", String(drop.lat));
  q.set("dropoff[longitude]", String(drop.lng));
  q.set("dropoff[nickname]", drop.name);
  if (drop.address) q.set("dropoff[formatted_address]", drop.address);
  return `https://m.uber.com/ul/?${q.toString()}`;
}

// developers.olacabs.com/docs/deep-linking: utm_source must be an Ola-issued
// affiliate (XAPP) token, and the link needs a pickup point.
function ola(drop: Place, pickup?: Place, token?: string): string | null {
  if (!token || !pickup) return null;
  const q = new URLSearchParams({
    lat: String(pickup.lat), lng: String(pickup.lng), pickup_name: pickup.name,
    drop_lat: String(drop.lat), drop_lng: String(drop.lng), drop_name: drop.name,
    utm_source: token,
  });
  return `https://book.olacabs.com/?${q.toString()}`;
}

export function rideLinks(services: RideService[], drop: Place, pickup?: Place, olaToken?: string): RideLink[] {
  return services.map((service) => {
    const url = service === "uber" ? uber(drop, pickup) : service === "ola" ? ola(drop, pickup, olaToken) : null;
    if (url) return { service, url, label: `${NAMES[service]} to ${drop.name}`, prefilled: true };
    const home = service === "ola" ? "https://book.olacabs.com/" : "https://www.rapido.bike/";
    return { service, url: home, label: `Open ${NAMES[service]}`, prefilled: false };
  });
}
