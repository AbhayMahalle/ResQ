import React, { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../api';
import type { NetworkMetadata, SearchResultItem } from '../types';

interface TopSearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSelectPlace: (place: SearchResultItem) => void;
  activeNetwork: NetworkMetadata | null;
  networks: NetworkMetadata[];
  onSelectNetwork: (id: string) => void;
  onFlyToNetwork: () => void;
  isLocating: boolean;
  onLocateUser: () => void;
  onToggleDirections: () => void;
  isDirectionsActive: boolean;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  userCoords?: [number, number] | null;
}

export const TopSearchBar: React.FC<TopSearchBarProps> = ({
  searchQuery,
  onSearchQueryChange,
  onSelectPlace,
  activeNetwork,
  networks,
  onSelectNetwork,
  onFlyToNetwork,
  isLocating,
  onLocateUser,
  onToggleDirections,
  isDirectionsActive,
  onToggleSidebar,
  isSidebarOpen,
  userCoords,
}) => {
  const [showNetworkMenu, setShowNetworkMenu] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SearchResultItem[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const searchWrapperRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<any>(null);
  const justSelectedRef = useRef<boolean>(false);

  // Debounced search when searchQuery changes
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }

    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSuggestions([]);
      setIsDropdownOpen(false);
      setIsLoadingSuggestions(false);
      return;
    }

    setIsLoadingSuggestions(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(searchQuery.trim(), {
          network_id: activeNetwork?.id,
          lat: userCoords ? userCoords[1] : undefined,
          lon: userCoords ? userCoords[0] : undefined,
        });
        setSuggestions(results);
        setIsDropdownOpen(true);
        setSelectedIndex(-1);
      } catch (err) {
        console.warn('Autocomplete search failed:', err);
        setSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 240);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, activeNetwork?.id, userCoords]);

  // Click outside listener to dismiss dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setShowNetworkMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (item: SearchResultItem) => {
    justSelectedRef.current = true;
    onSearchQueryChange(item.name);
    setIsDropdownOpen(false);
    onSelectPlace(item);
  };

  const handleExecuteSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    if (suggestions.length > 0) {
      const best = selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0];
      handleSelectSuggestion(best);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const results = await searchPlaces(q, {
        network_id: activeNetwork?.id,
        lat: userCoords ? userCoords[1] : undefined,
        lon: userCoords ? userCoords[0] : undefined,
      });
      if (results && results.length > 0) {
        handleSelectSuggestion(results[0]);
      } else {
        setSuggestions([]);
        setIsDropdownOpen(true);
      }
    } catch (err) {
      console.warn('Direct search failed:', err);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleExecuteSearch();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else if (suggestions.length > 0) {
        handleSelectSuggestion(suggestions[0]);
      } else {
        handleExecuteSearch();
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'hospital':
        return '🏥';
      case 'fire_station':
        return '🚒';
      case 'police':
        return '🚓';
      case 'shelter':
        return '⛺';
      case 'warehouse':
        return '📦';
      case 'street':
        return '🛣️';
      default:
        return '📍';
    }
  };

  return (
    <div className="top-search-bar-wrapper" ref={searchWrapperRef}>
      <div className="floating-search-bar">
        {/* Menu / Brand Button */}
        <button
          type="button"
          className={`search-icon-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          title="Toggle Navigation Menu"
          aria-label="Toggle navigation menu"
        >
          <svg className="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Brand identity badge */}
        <div className="brand-badge-pill" title="ResQ — Emergency Navigation & Disaster Response">
          <span className="brand-dot" />
          <span className="brand-name">ResQ</span>
        </div>

        {/* Search input container */}
        <form
          className="search-input-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleExecuteSearch();
          }}
        >
          <input
            type="text"
            className="search-input"
            placeholder={
              activeNetwork
                ? 'Search places, hospitals, streets...'
                : 'Search places, emergency facilities...'
            }
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setIsDropdownOpen(true);
            }}
            onKeyDown={handleKeyDown}
            aria-autocomplete="list"
            aria-expanded={isDropdownOpen}
          />

          {isLoadingSuggestions && (
            <span className="search-loading-spinner" title="Searching..." />
          )}

          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => {
                onSearchQueryChange('');
                setSuggestions([]);
                setIsDropdownOpen(false);
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}

          <button
            type="submit"
            className="search-submit-btn"
            title="Search place or facility"
            aria-label="Search"
          >
            <svg className="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </form>

        <div className="search-bar-divider" />

        {/* Network indicator pill */}
        <div className="network-pill-container">
          <button
            type="button"
            className="network-pill-btn"
            onClick={() => setShowNetworkMenu(!showNetworkMenu)}
            title={`Active area: ${activeNetwork?.name || 'Select Network'}`}
          >
            <span className="network-status-indicator" />
            <span className="network-pill-name">{activeNetwork ? activeNetwork.name : 'Select Area'}</span>
            <svg className="caret-svg" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {showNetworkMenu && (
            <div className="network-dropdown-menu">
              <div className="menu-header-row">
                <span>Active Coverage Area</span>
                {activeNetwork && (
                  <button
                    type="button"
                    className="menu-flyto-btn"
                    onClick={() => {
                      onFlyToNetwork();
                      setShowNetworkMenu(false);
                    }}
                    title="Center on this network"
                  >
                    📍 Center
                  </button>
                )}
              </div>
              <div className="network-menu-list">
                {networks.map((net) => (
                  <button
                    key={net.id}
                    type="button"
                    className={`network-menu-item ${net.id === activeNetwork?.id ? 'active' : ''}`}
                    onClick={() => {
                      onSelectNetwork(net.id);
                      setShowNetworkMenu(false);
                    }}
                  >
                    <div className="net-item-name">{net.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Directions / Routing Quick Button */}
        <button
          type="button"
          className={`directions-fab-btn ${isDirectionsActive ? 'active' : ''}`}
          onClick={onToggleDirections}
          title="Open Navigation"
          aria-label="Open navigation"
        >
          <svg className="icon-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.71 11.29l-9-9a1 1 0 00-1.42 0l-9 9a1 1 0 000 1.42l9 9a1 1 0 001.42 0l9-9a1 1 0 000-1.42zM14 14.5V12h-4v3H8v-4a1 1 0 011-1h5V7.5l3.5 3.5-3.5 3.5z" />
          </svg>
        </button>

        {/* Locate Me Button */}
        <button
          type="button"
          className={`locate-btn ${isLocating ? 'locating' : ''}`}
          onClick={onLocateUser}
          title="Center on your current device location"
          aria-label="Current location"
        >
          <svg
            className={`icon-svg ${isLocating ? 'spin-anim' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="23" />
            <line x1="1" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="23" y2="12" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Autocomplete Suggestions Dropdown */}
      {isDropdownOpen && (
        <div className="search-autocomplete-dropdown" role="listbox">
          {suggestions.length > 0 ? (
            suggestions.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`autocomplete-item ${isSelected ? 'selected' : ''}`}
                  onMouseDown={(e) => {
                    // Prevent search input from blurring and immediately select place
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectSuggestion(item);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectSuggestion(item);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className="autocomplete-icon-col">
                    <span className="autocomplete-cat-icon">{getCategoryIcon(item.category)}</span>
                  </div>
                  <div className="autocomplete-info-col">
                    <div className="autocomplete-title">{item.name}</div>
                    <div className="autocomplete-context">{item.location_context}</div>
                  </div>
                  {item.distance_m !== undefined && item.distance_m !== null && (
                    <div className="autocomplete-dist-col">
                      {item.distance_m < 1000
                        ? `${Math.round(item.distance_m)} m`
                        : `${(item.distance_m / 1000).toFixed(1)} km`}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="autocomplete-empty-state">
              No places or emergency facilities found for "{searchQuery}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default TopSearchBar;
