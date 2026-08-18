import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type Neighborhood = Database["public"]["Tables"]["neighborhoods"]["Row"];

const neighborhoodSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
});

interface NeighborhoodFormProps {
  neighborhood?: Neighborhood | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const NeighborhoodForm = ({
  neighborhood,
  onClose,
  onSuccess,
}: NeighborhoodFormProps) => {
  const [formData, setFormData] = useState({
    name: neighborhood?.name || "",
    slug: neighborhood?.slug || "",
    description: neighborhood?.description || "",
    center_lat: neighborhood ? Number(neighborhood.center_lat) : 0,
    center_lng: neighborhood ? Number(neighborhood.center_lng) : 0,
    active: neighborhood?.active ?? true,
    boundary_points: neighborhood?.boundary_points || [],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const validatedData = neighborhoodSchema.parse(data);

      if (neighborhood) {
        const { error } = await supabase
          .from("neighborhoods")
          .update({
            name: validatedData.name,
            slug: validatedData.slug,
            description: validatedData.description || null,
            center_lat: validatedData.center_lat,
            center_lng: validatedData.center_lng,
            boundary_points: data.boundary_points,
            active: data.active,
          })
          .eq("id", neighborhood.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("neighborhoods").insert([
          {
            name: validatedData.name,
            slug: validatedData.slug,
            description: validatedData.description || null,
            center_lat: validatedData.center_lat,
            center_lng: validatedData.center_lng,
            boundary_points: data.boundary_points,
            active: data.active,
          },
        ]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(
        neighborhood ? "Neighborhood updated" : "Neighborhood created",
      );
      onSuccess();
    },
    onError: (error) => {
      toast.error("Failed to save neighborhood");
      console.error("Save error:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {neighborhood ? "Edit Neighborhood" : "Create Neighborhood"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              maxLength={200}
              required
            />
          </div>

          <div>
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={formData.slug}
              onChange={(e) =>
                setFormData({ ...formData, slug: e.target.value })
              }
              maxLength={200}
              placeholder="lowercase-with-dashes"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              maxLength={1000}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="center_lat">Center Latitude</Label>
              <Input
                id="center_lat"
                type="number"
                step="0.000001"
                value={formData.center_lat}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    center_lat: parseFloat(e.target.value),
                  })
                }
                required
              />
            </div>

            <div>
              <Label htmlFor="center_lng">Center Longitude</Label>
              <Input
                id="center_lng"
                type="number"
                step="0.000001"
                value={formData.center_lng}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    center_lng: parseFloat(e.target.value),
                  })
                }
                required
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="active"
              checked={formData.active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, active: checked })
              }
            />
            <Label htmlFor="active">Active</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
