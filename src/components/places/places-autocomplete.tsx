"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { WICHITA_LOCATIONS, LOCATION_CATEGORIES, type PresetLocation } from "@/lib/wichita-locations";

interface PlaceResult {
  address: string;
  placeId: string;
  lat: number;
  lng: number;
}

interface PlacesAutocompleteProps {
  label: string;
  name: string;
  onSelect: (place: PlaceResult) => void;
  defaultValue?: string;
}

export function PlacesAutocomplete({
  label,
  name,
  onSelect,
  defaultValue = "",
}: PlacesAutocompleteProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter locations based on search and category
  const filtered = useMemo(() => {
    let locs = WICHITA_LOCATIONS;

    if (activeCategory) {
      locs = locs.filter((l) => l.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      locs = locs.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q)
      );
    }

    return locs;
  }, [search, activeCategory]);

  // Group by category for display
  const grouped = useMemo(() => {
    const groups: Record<string, PresetLocation[]> = {};
    for (const loc of filtered) {
      if (!groups[loc.category]) groups[loc.category] = [];
      groups[loc.category].push(loc);
    }
    return groups;
  }, [filtered]);

  function handleSelectLocation(loc: PresetLocation) {
    setValue(loc.name);
    setOpen(false);
    setSearch("");
    setCustomMode(false);
    onSelect({
      address: loc.address,
      placeId: "",
      lat: loc.lat,
      lng: loc.lng,
    });
  }

  function handleCustomAddress(addr: string) {
    setValue(addr);
    onSelect({
      address: addr,
      placeId: "",
      lat: 0,
      lng: 0,
    });
  }

  function handleInputClick() {
    if (!customMode) {
      setOpen(true);
    }
  }

  function switchToCustom() {
    setCustomMode(true);
    setOpen(false);
    setValue("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function switchToPreset() {
    setCustomMode(false);
    setValue("");
    setSearch("");
    setOpen(true);
    onSelect({ address: "", placeId: "", lat: 0, lng: 0 });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      {/* Display input */}
      <div className="relative">
        <input
          ref={inputRef}
          name={name}
          value={value}
          readOnly={!customMode}
          onClick={handleInputClick}
          onChange={(e) => {
            if (customMode) {
              handleCustomAddress(e.target.value);
            }
          }}
          placeholder={customMode ? "Type a full address..." : "Select a location..."}
          className={`w-full rounded-lg border border-gray-300 pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 ${
            !customMode ? "cursor-pointer bg-white" : ""
          }`}
          autoComplete="off"
        />
        {/* Toggle chevron / clear */}
        {value && !customMode ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setValue("");
              onSelect({ address: "", placeId: "", lat: 0, lng: 0 });
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : !customMode ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Mode toggle */}
      <div className="mt-1">
        {customMode ? (
          <button
            type="button"
            onClick={switchToPreset}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            ← Pick from preset locations
          </button>
        ) : (
          <button
            type="button"
            onClick={switchToCustom}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            Type a custom address instead
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && !customMode && (
        <div
          ref={dropdownRef}
          className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 flex flex-col"
        >
          {/* Search within dropdown */}
          <div className="p-2 border-b border-gray-100">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search locations..."
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
              autoFocus
            />
          </div>

          {/* Category pills */}
          <div className="px-2 py-1.5 border-b border-gray-100 flex gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={`px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${
                !activeCategory
                  ? "bg-teal-100 text-teal-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {LOCATION_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`px-2 py-0.5 text-xs rounded-full font-medium transition-colors ${
                  activeCategory === cat
                    ? "bg-teal-100 text-teal-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Location list */}
          <div className="overflow-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-500">No locations found</p>
                <button
                  type="button"
                  onClick={switchToCustom}
                  className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  Type a custom address
                </button>
              </div>
            ) : (
              Object.entries(grouped).map(([category, locs]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0">
                    {category}
                  </div>
                  {locs.map((loc) => (
                    <button
                      key={`${loc.name}-${loc.lat}`}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className="w-full text-left px-3 py-2 hover:bg-teal-50 transition-colors border-b border-gray-50 last:border-b-0"
                    >
                      <div className="text-sm font-medium text-gray-900">
                        {loc.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {loc.address}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
