import { useEffect, useState } from "react";

export function parseHashPath(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

export function navigateTo(path: string) {
  window.location.hash = "#/" + path.replace(/^\/+/, "");
}

export function goBack() {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigateTo("");
  }
}

export function useHashPath(): string {
  const [path, setPath] = useState<string>(() => parseHashPath());
  useEffect(() => {
    const onChange = () => setPath(parseHashPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}
