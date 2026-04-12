import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { MapPin, Sparkles, ChevronDown, ChevronUp, Check, Loader2, UtensilsCrossed, Wine, Moon, CalendarDays, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  
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
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data?.preferences) {
        const prefs = data.preferences as ProfilePreferences;
        
        setSelectedCategories(prefs.categories || []);
        setTrendingVenues(prefs.trendingVenues ?? true);
        setActivityInArea(prefs.activityInArea ?? false);
        
        // Food
        setFoodCuisine(prefs.food?.cuisineType || []);
        setFoodDietary(prefs.food?.dietaryPreference || []);
        setFoodMeal(prefs.food?.mealOccasion || []);
        
        // Drink
        setDrinkCoffee(prefs.drink?.coffeeTea || []);
        setDrinkBar(prefs.drink?.barCocktail || []);
        setDrinkAtmosphere(prefs.drink?.atmosphere || []);
        
        // Nightlife
        setNightlifeVenue(prefs.nightlife?.venueType || []);
        setNightlifeMusic(prefs.nightlife?.musicPreference || []);
        setNightlifeCrowd(prefs.nightlife?.crowdVibe || []);
        
        // Events
        setEventsType(prefs.events?.eventType || []);
        setEventsGroup(prefs.events?.groupType || []);
        setEventsTime(prefs.events?.timeSetting || []);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
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

      const { error } = await supabase
        .from('profiles')
        .update({
          preferences: preferencesJson as unknown as Json,
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Preferences saved successfully');
      onSaved?.();
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

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
      if (prev.length >= 3) {
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
    currentSelection: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    maxSelections: number = 5
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
    onClick 
  }: { 
    label: string; 
    selected: boolean; 
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
        selected
          ? "bg-primary text-primary-foreground border-primary"
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
  }: {
    title: string;
    options: string[];
    selected: string[];
    onToggle: (option: string) => void;
  }) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title} <span className="text-muted-foreground/60">(up to 5)</span></p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(option => (
          <OptionChip
            key={option}
            label={option}
            selected={selected.includes(option)}
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
        className="w-full mt-4 bg-primary text-primary-foreground py-2.5 rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
