import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MapPin, Sparkles, ChevronDown, ChevronUp, Check, AlertCircle, UtensilsCrossed, Wine, Moon, CalendarDays, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreferencesStepProps {
  onBack: () => void;
  onNext: (preferences: PreferencesData) => void;
  isLoading: boolean;
  initialPreferences?: PreferencesData | null;
}

export interface PreferencesData {
  categories: string[];
  food: FoodPreferences;
  drink: DrinkPreferences;
  nightlife: NightlifePreferences;
  events: EventsPreferences;
  trendingVenues: boolean;
  activityInArea: boolean;
}

interface FoodPreferences {
  cuisineType: string[];
  dietaryPreference: string[];
  mealOccasion: string[];
}

interface DrinkPreferences {
  coffeeTea: string[];
  barCocktail: string[];
  atmosphere: string[];
}

interface NightlifePreferences {
  venueType: string[];
  musicPreference: string[];
  crowdVibe: string[];
}

interface EventsPreferences {
  eventType: string[];
  groupType: string[];
  timeSetting: string[];
}

const FOOD_OPTIONS = {
  cuisineType: ["American", "Italian", "Mexican", "Asian Fusion", "Mediterranean"],
  dietaryPreference: ["Vegetarian", "Vegan", "Gluten-Free", "Keto", "Halal"],
  mealOccasion: ["Breakfast", "Brunch", "Lunch", "Dinner", "Late Night Bites"],
};

const DRINK_OPTIONS = {
  coffeeTea: ["Espresso-based", "Cold brew", "Specialty teas", "Matcha", "Flavored lattes"],
  barCocktail: ["Craft cocktails", "Classic cocktails", "Wine bar", "Craft beer", "Whiskey bar"],
  atmosphere: ["Quiet & cozy", "Modern & upscale", "Casual & social", "Outdoor seating", "Live music friendly"],
};

const NIGHTLIFE_OPTIONS = {
  venueType: ["Clubs", "Lounges", "Bars", "Rooftop venues", "Speakeasies"],
  musicPreference: ["Hip-Hop", "EDM", "Pop/Top 40", "Latin", "Live bands"],
  crowdVibe: ["High-energy", "Chill/lounge", "Young professional", "Mixed crowd", "Exclusive/VIP"],
};

const EVENTS_OPTIONS = {
  eventType: ["Concerts", "Festivals", "Sports events", "Comedy shows", "Cultural events"],
  groupType: ["Solo", "Date night", "Friends/group outing", "Family-friendly", "Networking/meetups"],
  timeSetting: ["Daytime events", "Evening events", "Outdoor", "Indoor", "Seasonal/holiday"],
};

const MAX_CATEGORIES = 3;
const MAX_OPTIONS = 5;

const PreferencesStep = ({ onBack, onNext, isLoading, initialPreferences }: PreferencesStepProps) => {
  const init = initialPreferences ?? null;
  const [selectedCategories, setSelectedCategories] = useState<string[]>(init?.categories ?? []);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Food preferences
  const [foodCuisine, setFoodCuisine] = useState<string[]>(init?.food?.cuisineType ?? []);
  const [foodDietary, setFoodDietary] = useState<string[]>(init?.food?.dietaryPreference ?? []);
  const [foodMeal, setFoodMeal] = useState<string[]>(init?.food?.mealOccasion ?? []);

  // Drink preferences
  const [drinkCoffee, setDrinkCoffee] = useState<string[]>(init?.drink?.coffeeTea ?? []);
  const [drinkBar, setDrinkBar] = useState<string[]>(init?.drink?.barCocktail ?? []);
  const [drinkAtmosphere, setDrinkAtmosphere] = useState<string[]>(init?.drink?.atmosphere ?? []);

  // Nightlife preferences
  const [nightlifeVenue, setNightlifeVenue] = useState<string[]>(init?.nightlife?.venueType ?? []);
  const [nightlifeMusic, setNightlifeMusic] = useState<string[]>(init?.nightlife?.musicPreference ?? []);
  const [nightlifeCrowd, setNightlifeCrowd] = useState<string[]>(init?.nightlife?.crowdVibe ?? []);

  // Events preferences
  const [eventsType, setEventsType] = useState<string[]>(init?.events?.eventType ?? []);
  const [eventsGroup, setEventsGroup] = useState<string[]>(init?.events?.groupType ?? []);
  const [eventsTime, setEventsTime] = useState<string[]>(init?.events?.timeSetting ?? []);

  // Live discovery
  const [trendingVenues, setTrendingVenues] = useState(init?.trendingVenues ?? true);
  const [activityInArea, setActivityInArea] = useState(init?.activityInArea ?? false);

  const atCategoryCap = selectedCategories.length >= MAX_CATEGORIES;

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        // Clear subcategory selections when deselecting
        if (category === "Food") {
          setFoodCuisine([]);
          setFoodDietary([]);
          setFoodMeal([]);
        } else if (category === "Drinks") {
          setDrinkCoffee([]);
          setDrinkBar([]);
          setDrinkAtmosphere([]);
        } else if (category === "Nightlife") {
          setNightlifeVenue([]);
          setNightlifeMusic([]);
          setNightlifeCrowd([]);
        } else if (category === "Events") {
          setEventsType([]);
          setEventsGroup([]);
          setEventsTime([]);
        }
        return prev.filter(c => c !== category);
      }
      if (prev.length >= MAX_CATEGORIES) {
        return prev;
      }
      return [...prev, category];
    });
  };

  const toggleExpanded = (category: string) => {
    if (!selectedCategories.includes(category)) return;
    setExpandedCategory(prev => prev === category ? null : category);
  };

  const toggleOption = (
    option: string,
    _currentSelection: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    maxSelections: number = MAX_OPTIONS
  ) => {
    setter(prev => {
      if (prev.includes(option)) {
        return prev.filter(o => o !== option);
      }
      if (prev.length >= maxSelections) {
        return prev;
      }
      return [...prev, option];
    });
  };

  const handleNext = () => {
    if (selectedCategories.length === 0) {
      setCategoryError("Please select at least one category");
      return;
    }
    setCategoryError(null);

    const preferences: PreferencesData = {
      categories: selectedCategories,
      food: {
        cuisineType: foodCuisine,
        dietaryPreference: foodDietary,
        mealOccasion: foodMeal,
      },
      drink: {
        coffeeTea: drinkCoffee,
        barCocktail: drinkBar,
        atmosphere: drinkAtmosphere,
      },
      nightlife: {
        venueType: nightlifeVenue,
        musicPreference: nightlifeMusic,
        crowdVibe: nightlifeCrowd,
      },
      events: {
        eventType: eventsType,
        groupType: eventsGroup,
        timeSetting: eventsTime,
      },
      trendingVenues,
      activityInArea,
    };
    onNext(preferences);
  };

  const OptionChip = ({ 
    label, 
    selected, 
    onClick,
    disabled,
  }: { 
    label: string; 
    selected: boolean; 
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-medium transition-all",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:bg-muted",
        disabled && !selected && "opacity-40 cursor-not-allowed hover:border-border hover:bg-muted/50"
      )}
    >
      {label}
    </button>
  );

  const SubcategorySection = ({
    title,
    options,
    selected,
    onToggle,
  }: {
    title: string;
    options: string[];
    selected: string[];
    onToggle: (option: string) => void;
  }) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {title}{" "}
        <span className={cn(selected.length >= MAX_OPTIONS ? "text-primary" : "text-muted-foreground")}>
          ({selected.length}/{MAX_OPTIONS})
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <OptionChip
            key={option}
            label={option}
            selected={selected.includes(option)}
            disabled={selected.length >= MAX_OPTIONS && !selected.includes(option)}
            onClick={() => onToggle(option)}
          />
        ))}
      </div>
    </div>
  );

  const CategoryCard = ({
    category,
    Icon,
    isSelected,
    isExpanded,
    children,
  }: {
    category: string;
    Icon: LucideIcon;
    isSelected: boolean;
    isExpanded: boolean;
    children?: React.ReactNode;
  }) => (
    <div
      className={cn(
        "border rounded-xl transition-all overflow-hidden",
        isSelected ? "border-primary bg-primary/5" : "border-border bg-card"
      )}
    >
      <div className="flex items-center pr-2">
        <button
          type="button"
          onClick={() => toggleCategory(category)}
          disabled={!isSelected && atCategoryCap}
          aria-pressed={isSelected}
          className={cn(
            "flex min-h-11 flex-1 items-center justify-between gap-3 p-3 text-left",
            !isSelected && atCategoryCap && "opacity-40 cursor-not-allowed"
          )}
        >
          <span className="flex items-center gap-3">
            <Icon className={cn("w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground")} />
            <span className={cn(
              "font-medium text-sm",
              isSelected ? "text-foreground" : "text-muted-foreground"
            )}>
              {category}
            </span>
          </span>
          {isSelected && <Check className="w-4 h-4 shrink-0 text-primary" />}
        </button>
        {isSelected && (
          <button
            type="button"
            onClick={() => toggleExpanded(category)}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Hide" : "Show"} ${category} preferences`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
      {isSelected && isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-fluid-sm">
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label className="heading-luxe-eyebrow text-left">Select up to 3 categories</Label>
            <span
              className={cn("text-[11px] font-semibold", atCategoryCap ? "text-primary" : "text-muted-foreground")}
              aria-live="polite"
            >
              {selectedCategories.length}/{MAX_CATEGORIES}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {atCategoryCap
              ? "Max reached — deselect one to swap in another."
              : "Tap a category to select, then expand to set preferences"}
          </p>
          
          <div className="space-y-2">
            <CategoryCard
              category="Food"
              Icon={UtensilsCrossed}
              isSelected={selectedCategories.includes("Food")}
              isExpanded={expandedCategory === "Food"}
            >
              <SubcategorySection
                title="Cuisine Type"
                options={FOOD_OPTIONS.cuisineType}
                selected={foodCuisine}
                onToggle={(o) => toggleOption(o, foodCuisine, setFoodCuisine)}
              />
              <SubcategorySection
                title="Dietary Preference"
                options={FOOD_OPTIONS.dietaryPreference}
                selected={foodDietary}
                onToggle={(o) => toggleOption(o, foodDietary, setFoodDietary)}
              />
              <SubcategorySection
                title="Meal Occasion"
                options={FOOD_OPTIONS.mealOccasion}
                selected={foodMeal}
                onToggle={(o) => toggleOption(o, foodMeal, setFoodMeal)}
              />
            </CategoryCard>

            <CategoryCard
              category="Drinks"
              Icon={Wine}
              isSelected={selectedCategories.includes("Drinks")}
              isExpanded={expandedCategory === "Drinks"}
            >
              <SubcategorySection
                title="Coffee & Tea"
                options={DRINK_OPTIONS.coffeeTea}
                selected={drinkCoffee}
                onToggle={(o) => toggleOption(o, drinkCoffee, setDrinkCoffee)}
              />
              <SubcategorySection
                title="Bar & Cocktail Style"
                options={DRINK_OPTIONS.barCocktail}
                selected={drinkBar}
                onToggle={(o) => toggleOption(o, drinkBar, setDrinkBar)}
              />
              <SubcategorySection
                title="Atmosphere"
                options={DRINK_OPTIONS.atmosphere}
                selected={drinkAtmosphere}
                onToggle={(o) => toggleOption(o, drinkAtmosphere, setDrinkAtmosphere)}
              />
            </CategoryCard>

            <CategoryCard
              category="Nightlife"
              Icon={Moon}
              isSelected={selectedCategories.includes("Nightlife")}
              isExpanded={expandedCategory === "Nightlife"}
            >
              <SubcategorySection
                title="Venue Type"
                options={NIGHTLIFE_OPTIONS.venueType}
                selected={nightlifeVenue}
                onToggle={(o) => toggleOption(o, nightlifeVenue, setNightlifeVenue)}
              />
              <SubcategorySection
                title="Music Preference"
                options={NIGHTLIFE_OPTIONS.musicPreference}
                selected={nightlifeMusic}
                onToggle={(o) => toggleOption(o, nightlifeMusic, setNightlifeMusic)}
              />
              <SubcategorySection
                title="Crowd & Vibe"
                options={NIGHTLIFE_OPTIONS.crowdVibe}
                selected={nightlifeCrowd}
                onToggle={(o) => toggleOption(o, nightlifeCrowd, setNightlifeCrowd)}
              />
            </CategoryCard>

            <CategoryCard
              category="Events"
              Icon={CalendarDays}
              isSelected={selectedCategories.includes("Events")}
              isExpanded={expandedCategory === "Events"}
            >
              <SubcategorySection
                title="Event Type"
                options={EVENTS_OPTIONS.eventType}
                selected={eventsType}
                onToggle={(o) => toggleOption(o, eventsType, setEventsType)}
              />
              <SubcategorySection
                title="Group Type"
                options={EVENTS_OPTIONS.groupType}
                selected={eventsGroup}
                onToggle={(o) => toggleOption(o, eventsGroup, setEventsGroup)}
              />
              <SubcategorySection
                title="Time & Setting"
                options={EVENTS_OPTIONS.timeSetting}
                selected={eventsTime}
                onToggle={(o) => toggleOption(o, eventsTime, setEventsTime)}
              />
            </CategoryCard>
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-border/40">
          <Label className="heading-luxe-eyebrow text-left">Live Discovery</Label>
          
          <div className="flex items-center justify-between p-3 bg-card/40 border border-border/40 rounded-xl backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <div>
                <p className="font-medium text-xs">Trending Venues</p>
                <p className="text-[10px] text-muted-foreground">See what's popular now</p>
              </div>
            </div>
            <Switch
              checked={trendingVenues}
              onCheckedChange={setTrendingVenues}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-card/40 border border-border/40 rounded-xl backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <div>
                <p className="font-medium text-xs">Activity in Your Area</p>
                <p className="text-[10px] text-muted-foreground">Get location-based alerts</p>
              </div>
            </div>
            <Switch
              checked={activityInArea}
              onCheckedChange={setActivityInArea}
            />
          </div>
        </div>
      </div>

      {categoryError && (
        <p className="field-error">
          <AlertCircle className="w-3.5 h-3.5" />
          {categoryError}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          className="flex-1 rounded-full border-primary/40 bg-transparent text-foreground hover:border-primary/70 hover:bg-primary/10 hover:text-primary"
          size="lg"
        >
          Back
        </Button>
        <Button
          onClick={handleNext}
          disabled={isLoading}
          variant="jet"
          size="lg"
          className="flex-1 rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
        >
          Continue
        </Button>
      </div>
    </div>
  );
};

export default PreferencesStep;
