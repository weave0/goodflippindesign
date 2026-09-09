const CLERK_PUBLISHABLE_KEY = "pk_live_Y2xlcmsuZ29vZGZsaXBwaW52aWJlcy5jb20k";

interface ClerkSession {
  getToken(): Promise<string | null>;
}

interface ClerkLike {
  load(options?: { publishableKey?: string }): Promise<void>;
  session?: ClerkSession | null;
  user?: unknown;
}

declare global {
  interface Window {
    Clerk?: ClerkLike;
  }
}

let adminToken: string | null = null;
let clerkLoadPromise: Promise<ClerkLike> | null = null;

function clerkFrontendApi(): string {
  const encoded = CLERK_PUBLISHABLE_KEY.replace(/^pk_(live|test)_/, "");
  const padded = encoded + "=====".slice(0, (4 - (encoded.length % 4)) % 4);
  return atob(padded).replace(/\$$/, "");
}

async function loadClerk(): Promise<ClerkLike> {
  if (window.Clerk) {
    await window.Clerk.load({ publishableKey: CLERK_PUBLISHABLE_KEY });
    return window.Clerk;
  }

  if (!clerkLoadPromise) {
    clerkLoadPromise = new Promise<ClerkLike>((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://${clerkFrontendApi()}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
      script.setAttribute("data-clerk-publishable-key", CLERK_PUBLISHABLE_KEY);
      script.onload = async () => {
        try {
          if (!window.Clerk) throw new Error("Clerk SDK unavailable after load");
          await window.Clerk.load({ publishableKey: CLERK_PUBLISHABLE_KEY });
          resolve(window.Clerk);
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error("Unable to load Clerk authentication"));
      document.head.appendChild(script);
    });
  }

  return clerkLoadPromise;
}

export async function authorizeAdmin(): Promise<"authorized" | "signed_out" | "forbidden"> {
  adminToken = null;
  const clerk = await loadClerk();
  if (!clerk.session || !clerk.user) return "signed_out";

  const token = await clerk.session.getToken();
  if (!token) return "signed_out";

  const response = await fetch("/api/admin-session", {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) return "signed_out";
  if (!response.ok) return "forbidden";

  adminToken = token;
  return "authorized";
}

export function getAdminToken(): string | null {
  return adminToken;
}
