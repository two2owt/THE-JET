import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { MapPin, Sparkles, ChevronDown, ChevronUp, Check, Loader2, UtensilsCrossed, Wine, Moon, CalendarDays, LucideIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { useProfile } from "@/hooks/useProfile";

interface PreferencesEditorProps {
  userId: string;
  onSaved?: () => void;
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

interface ProfilePreferences {
  categories?: string[];
  food?: FoodPreferences;
  drink?: DrinkPreferences;
  nightlife?: NightlifePreferences;
  events?: EventsPreferences;
  trendingVenues?: boolean;
  activityInArea?: boolean;
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

const PreferencesEditor = ({ userId, onSaved }: PreferencesEditorProps) => {
  const {
    profile,
    isLoading,
    updatePreferences,
    isSavingPreferences: isSaving,
  } = useProfile(userId);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [categoryNotice, setCategoryNotice] = useState<string | null>(null);
  const [subcategoryNotice, setSubcategoryNotice] = useState<{ category: string; message: string } | null>(null);
  
  // Food preferences
  const [foodCuisine, setFoodCuisine] = useState<string[]>([]);
  const [foodDietary, setFoodDietary] = useState<string[]>([]);
  const [foodMeal, setFoodMeal] = useState<string[]>([]);
  
  // Drink preferences
  const [drinkCoffee, setDrinkCoffee] = useState<string[]>([]);
  const [drinkBar, setDrinkBar] = useState<string[]>([]);
  const [drinkAtmosphere, setDrinkAtmosphere] = useState<string[]>([]);
  
  // Nightlife preferences
  const [nightlifeVenue, setNightlifeVenue] = useState<string[]>([]);
  const [nightlifeMusic, setNightlifeMusic] = useState<string[]>([]);
  const [nightlifeCrowd, setNightlifeCrowd] = useState<string[]>([]);
  
  // Events preferences
  const [eventsType, setEventsType] = useState<string[]>([]);
  const [eventsGroup, setEventsGroup] = useState<string[]>([]);
  const [eventsTime, setEventsTime] = useState<string[]>([]);
  
  // Live discovery
  const [trendingVenues, setTrendingVenues] = useState(true);
  const [activityInArea, setActivityInArea] = useState(false);

  useEffect(() => {
    if (!profile?.preferences) return;
    const prefs = profile.preferences as unknown as ProfilePreferences;

    setSelectedCategories(prefs.categories || []);
    setTrendingVenues(prefs.trendingVenues ?? true);
    setActivityInArea(prefs.activityInArea ?? false);

    setFoodCuisine(prefs.food?.cuisineType || []);
    setFoodDietary(prefs.food?.dietaryPreference || []);
    setFoodMeal(prefs.food?.mealOccasion || []);

    setDrinkCoffee(prefs.drink?.coffeeTea || []);
    setDrinkBar(prefs.drink?.barCocktail || []);
    setDrinkAtmosphere(prefs.drink?.atmosphere || []);

    setNightlifeVenue(prefs.nightlife?.venueType || []);
    setNightlifeMusic(prefs.nightlife?.musicPreference || []);
    setNightlifeCrowd(prefs.nightlife?.crowdVibe || []);

    setEventsType(prefs.events?.eventType || []);
    setEventsGroup(prefs.events?.groupType || []);
    setEventsTime(prefs.events?.timeSetting || []);
  }, [profile?.preferences]);

  const handleSave = async () => {
    try {
      const preferencesJson = {
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

      await updatePreferences(preferencesJson as unknown as Json);
      toast.success('Preferences saved successfully');
      onSaved?.();
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    }
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        setCategoryNotice(null);
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
      if (prev.length >= 3) {
        const msg = `You've reached the 3-category limit. Deselect ${prev.join(", ")} or one of them to choose ${category}.`;
        setCategoryNotice(msg);
        toast.info(msg);
        return prev;
      }
      setCategoryNotice(null);
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
    categoryTotal: number,
    categoryName: string
  ) => {
    setter(prev => {
      if (prev.includes(option)) {
        setSubcategoryNotice(null);
        return prev.filter(o => o !== option);
      }
      if (categoryTotal >= 5) {
        const msg = `You can pick up to 5 ${categoryName} preferences across all sections. Deselect one to add "${option}".`;
        setSubcategoryNotice({ category: categoryName, message: msg });
        toast.info(msg);
        return prev;
      }
      setSubcategoryNotice(null);
      return [...prev, option];
    });
  };

  const foodTotal = foodCuisine.length + foodDietary.length + foodMeal.length;
  const drinkTotal = drinkCoffee.length + drinkBar.length + drinkAtmosphere.length;
  const nightlifeTotal = nightlifeVenue.length + nightlifeMusic.length + nightlifeCrowd.length;
  const eventsTotal = eventsType.length + eventsGroup.length + eventsTime.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const OptionChip = ({ 
    label, 
    selected, 
    onClick,
    disabled = false,
  }: { 
    label: string; 
    selected: boolean; 
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={disabled}
      title={disabled ? "Limit reached — deselect another preference first" : undefined}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : disabled
            ? "bg-muted/30 text-muted-foreground/50 border-border/50 cursor-not-allowed"
            : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50 hover:bg-muted"
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
    remaining,
  }: {
    title: string;
    options: string[];
    selected: string[];
    onToggle: (option: string) => void;
    remaining: number;
  }) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {title}{" "}
        <span className={cn("text-muted-foreground/60", remaining === 0 && "text-destructive/80")}>
          ({remaining} left)
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <OptionChip
            key={option}
            label={option}
            selected={selected.includes(option)}
            disabled={remaining === 0 && !selected.includes(option)}
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
      {/* Use a div with role="button" to avoid nested button warning */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => toggleCategory(category)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleCategory(category);
          }
        }}
        className="w-full p-3 flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <Icon className={cn("w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground")} />
          <span className={cn(
            "font-medium text-sm",
            isSelected ? "text-foreground" : "text-muted-foreground"
          )}>
            {category}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isSelected && (
            <Check className="w-4 h-4 text-primary" />
          )}
          {isSelected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(category);
              }}
              className="p-1 hover:bg-muted rounded"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>
      {isSelected && isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm mb-1 block">Select up to 3 categories</Label>
        <p className="text-xs text-muted-foreground mb-3">Tap a category to select, then expand to set preferences</p>
        
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
              onToggle={(o) => toggleOption(o, foodCuisine, setFoodCuisine, foodTotal, "Food")}
              remaining={Math.max(0, 5 - foodTotal)}
            />
            <SubcategorySection
              title="Dietary Preference"
              options={FOOD_OPTIONS.dietaryPreference}
              selected={foodDietary}
              onToggle={(o) => toggleOption(o, foodDietary, setFoodDietary, foodTotal, "Food")}
              remaining={Math.max(0, 5 - foodTotal)}
            />
            <SubcategorySection
              title="Meal Occasion"
              options={FOOD_OPTIONS.mealOccasion}
              selected={foodMeal}
              onToggle={(o) => toggleOption(o, foodMeal, setFoodMeal, foodTotal, "Food")}
              remaining={Math.max(0, 5 - foodTotal)}
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
              onToggle={(o) => toggleOption(o, drinkCoffee, setDrinkCoffee, drinkTotal, "Drinks")}
              remaining={Math.max(0, 5 - drinkTotal)}
            />
            <SubcategorySection
              title="Bar & Cocktail Style"
              options={DRINK_OPTIONS.barCocktail}
              selected={drinkBar}
              onToggle={(o) => toggleOption(o, drinkBar, setDrinkBar, drinkTotal, "Drinks")}
              remaining={Math.max(0, 5 - drinkTotal)}
            />
            <SubcategorySection
              title="Atmosphere"
              options={DRINK_OPTIONS.atmosphere}
              selected={drinkAtmosphere}
              onToggle={(o) => toggleOption(o, drinkAtmosphere, setDrinkAtmosphere, drinkTotal, "Drinks")}
              remaining={Math.max(0, 5 - drinkTotal)}
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
              onToggle={(o) => toggleOption(o, nightlifeVenue, setNightlifeVenue, nightlifeTotal, "Nightlife")}
              remaining={Math.max(0, 5 - nightlifeTotal)}
            />
            <SubcategorySection
              title="Music Preference"
              options={NIGHTLIFE_OPTIONS.musicPreference}
              selected={nightlifeMusic}
              onToggle={(o) => toggleOption(o, nightlifeMusic, setNightlifeMusic, nightlifeTotal, "Nightlife")}
              remaining={Math.max(0, 5 - nightlifeTotal)}
            />
            <SubcategorySection
              title="Crowd & Vibe"
              options={NIGHTLIFE_OPTIONS.crowdVibe}
              selected={nightlifeCrowd}
              onToggle={(o) => toggleOption(o, nightlifeCrowd, setNightlifeCrowd, nightlifeTotal, "Nightlife")}
              remaining={Math.max(0, 5 - nightlifeTotal)}
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
              onToggle={(o) => toggleOption(o, eventsType, setEventsType, eventsTotal, "Events")}
              remaining={Math.max(0, 5 - eventsTotal)}
            />
            <SubcategorySection
              title="Group Type"
              options={EVENTS_OPTIONS.groupType}
              selected={eventsGroup}
              onToggle={(o) => toggleOption(o, eventsGroup, setEventsGroup, eventsTotal, "Events")}
              remaining={Math.max(0, 5 - eventsTotal)}
            />
            <SubcategorySection
              title="Time & Setting"
              options={EVENTS_OPTIONS.timeSetting}
              selected={eventsTime}
              onToggle={(o) => toggleOption(o, eventsTime, setEventsTime, eventsTotal, "Events")}
              remaining={Math.max(0, 5 - eventsTotal)}
            />
          </CategoryCard>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-sm">Live Discovery</Label>
        
        <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <div>
              <p className="font-medium text-xs text-foreground">Trending Venues</p>
              <p className="text-[10px] text-muted-foreground">See what's popular now</p>
            </div>
          </div>
          <Switch
            checked={trendingVenues}
            onCheckedChange={setTrendingVenues}
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <div>
              <p className="font-medium text-xs text-foreground">Activity in Your Area</p>
              <p className="text-[10px] text-muted-foreground">Get location-based alerts</p>
            </div>
          </div>
          <Switch
            checked={activityInArea}
            onCheckedChange={setActivityInArea}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full mt-4 bg-primary text-primary-foreground py-2.5 rounded-full font-semibold tracking-wide shadow-lg shadow-primary/20 text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Preferences'
        )}
      </button>
    </div>
  );
};

export default PreferencesEditor;
