import {
  Beer,
  Coffee,
  Disc3,
  Drama,
  Dumbbell,
  Hotel,
  ShoppingBag,
  Utensils,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps a venue/deal category to the same iconology + accent hues used by the
 * map markers, so search placeholders read consistently with the map.
 */
export const categoryIconFor = (
  category?: string | null,
): { Icon: LucideIcon; accent: string } => {
  const c = (category || "").toLowerCase();
  if (/(bar|cocktail|lounge|pub|brew|beer|wine|spirits)/.test(c))
    return { Icon: Beer, accent: "#C6A0F5" };
  if (/(coffee|cafe|tea|bakery|dessert)/.test(c))
    return { Icon: Coffee, accent: "#F0B27A" };
  if (/(music|concert|live|venue|night|club|dj)/.test(c))
    return { Icon: Disc3, accent: "#F58BC0" };
  if (/(event|festival|theater|theatre|show|comedy)/.test(c))
    return { Icon: Drama, accent: "#F5D06F" };
  if (/(gym|fitness|yoga|sport|run|spa)/.test(c))
    return { Icon: Dumbbell, accent: "#7FDCC2" };
  if (/(shop|retail|store|market|boutique)/.test(c))
    return { Icon: ShoppingBag, accent: "#7FC4F2" };
  if (/(hotel|stay|lodging|resort)/.test(c))
    return { Icon: Hotel, accent: "#B3AAF0" };
  return { Icon: Utensils, accent: "#FF8FA3" };
};
