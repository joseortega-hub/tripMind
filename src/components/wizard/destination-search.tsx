"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DataSource } from "@/components/data-source";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GeocodeResult } from "@/domain";
import { ApiError, getJson, type ProviderMeta } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { describedBy } from "./field";

interface GeocodeResponse {
  results: GeocodeResult[];
  provider: ProviderMeta;
}

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Autocompletado de destino contra `/api/geocode` (combobox accesible, patrón ARIA 1.2). */
export function DestinationSearch({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value?: GeocodeResult;
  error?: string;
  onChange: (value: GeocodeResult | undefined) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = useDebounced(text.trim(), 250);
  // Búsqueda completa explícita (Nominatim, en español). Solo al pedirla: su política prohíbe
  // usarlo para autocompletar, y es la que entiende "Varsovia" o "Moscú".
  const [searched, setSearched] = useState<string | null>(null);

  const {
    data,
    isFetching,
    error: fetchError,
  } = useQuery({
    queryKey: ["geocode", query],
    queryFn: ({ signal }) =>
      getJson<GeocodeResponse>(
        `/api/geocode?${new URLSearchParams({ q: query, mode: "autocomplete", limit: "6" })}`,
        signal,
      ),
    enabled: query.length >= 2 && searched === null,
    retry: false,
  });
  const {
    data: searchData,
    isFetching: isSearching,
    error: searchError,
  } = useQuery({
    queryKey: ["geocode-search", searched],
    queryFn: ({ signal }) =>
      getJson<GeocodeResponse>(
        `/api/geocode?${new URLSearchParams({ q: searched ?? "", mode: "search", limit: "6" })}`,
        signal,
      ),
    enabled: searched !== null,
    retry: false,
  });
  const inSearch = searched !== null;
  const activeData = inSearch ? searchData : data;
  const results = query.length >= 2 || inSearch ? (activeData?.results ?? []) : [];
  const provider = activeData?.provider;
  const busy = inSearch ? isSearching : isFetching;
  const listError = inSearch ? searchError : fetchError;
  // Fila final "Buscar «…» en español" (navegable con flechas como una opción más).
  const canSearch = !inSearch && query.length >= 2;
  const optionCount = results.length + (canSearch ? 1 : 0);
  const runSearch = () => {
    setSearched(query);
    setOpen(true);
    setActive(-1);
  };

  const select = (result: GeocodeResult) => {
    onChange(result);
    setText("");
    setSearched(null);
    setOpen(false);
    setActive(-1);
  };

  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <div
          id={id}
          tabIndex={-1}
          className="bg-accent/50 flex items-start justify-between gap-3 rounded-lg border p-3 outline-none"
        >
          <div className="flex min-w-0 gap-3">
            <MapPin className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">{value.name}</p>
              <p className="text-muted-foreground truncate text-sm">{value.label}</p>
              <DataSource source={value.source} isDemo={value.isDemo} className="mt-1" />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => {
              onChange(undefined);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <X aria-hidden />
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  const showList = open && (query.length >= 2 || inSearch) && !listError;
  const activeId = active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          placeholder="Ciudad, región o país"
          value={text}
          className="h-11 pl-9 text-base"
          onChange={(event) => {
            setText(event.target.value);
            setSearched(null);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, optionCount - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === "Enter") {
              const result = results[active] ?? (results.length === 1 ? results[0] : undefined);
              if (showList && result) {
                event.preventDefault();
                select(result);
              } else if (canSearch) {
                event.preventDefault();
                runSearch();
              }
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          {...describedBy(id, error)}
        />
        {busy ? (
          <Loader2
            className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
            aria-label="Buscando"
          />
        ) : null}
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugerencias de destino"
          className={cn(
            "bg-popover absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border p-1 shadow-md",
            !showList && "hidden",
          )}
        >
          {results.map((result, index) => (
            <li
              key={result.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                "flex cursor-pointer flex-col rounded-md px-3 py-2 text-sm",
                index === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(result)}
            >
              <span className="font-medium">{result.name}</span>
              <span className="text-muted-foreground text-xs">{result.label}</span>
            </li>
          ))}
          {canSearch ? (
            <li
              id={`${listId}-${results.length}`}
              role="option"
              aria-selected={active === results.length}
              className={cn(
                "text-primary flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                active === results.length ? "bg-accent" : "hover:bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={runSearch}
            >
              <Search className="size-4 shrink-0" aria-hidden />
              ¿No aparece? Buscar «{query}» en español
            </li>
          ) : null}
          {!busy && activeData && results.length === 0 ? (
            <li role="presentation" className="text-muted-foreground px-3 py-2 text-sm">
              Sin resultados para «{inSearch ? searched : query}».
              {provider?.isDemo
                ? " En modo demostración solo hay respuestas grabadas (por ejemplo, Madrid o Barcelona)."
                : null}
            </li>
          ) : null}
        </ul>
      </div>
      <p className="sr-only" aria-live="polite">
        {showList && !busy ? `${results.length} sugerencias disponibles` : ""}
      </p>
      {provider?.isDemo && provider.notice ? (
        <p className="text-muted-foreground text-xs">{provider.notice}</p>
      ) : null}
      {listError ? <ProviderErrorAlert error={listError} /> : null}
    </div>
  );
}

export function ProviderErrorAlert({ error }: { error: Error }) {
  const externalUrl = error instanceof ApiError ? error.externalUrl : undefined;
  return (
    <Alert variant="destructive">
      <AlertTitle>No se pueden cargar sugerencias</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {externalUrl ? (
          <a href={externalUrl} target="_blank" rel="noreferrer" className="underline">
            Buscar en OpenStreetMap
          </a>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
