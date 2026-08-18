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

type Deal = Database["public"]["Tables"]["deals"]["Row"];

const dealSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  venue_name: z.string().min(1).max(200),
  venue_id: z.string().min(1).max(200),
  deal_type: z.string().min(1).max(100),
  website_url: z.string().url().optional().or(z.literal("")),
  image_url: z.string().url().optional().or(z.literal("")),
});

interface DealFormProps {
  deal?: Deal | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const DealForm = ({ deal, onClose, onSuccess }: DealFormProps) => {
  const [formData, setFormData] = useState({
    title: deal?.title || "",
    description: deal?.description || "",
    venue_name: deal?.venue_name || "",
    venue_id: deal?.venue_id || "",
    deal_type: deal?.deal_type || "",
    website_url: deal?.website_url || "",
    image_url: deal?.image_url || "",
    active: deal?.active ?? true,
    starts_at: deal?.starts_at || new Date().toISOString(),
    expires_at:
      deal?.expires_at ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const validatedData = dealSchema.parse(data);

      if (deal) {
        const { error } = await supabase
          .from("deals")
          .update({
            title: validatedData.title,
            description: validatedData.description,
            venue_name: validatedData.venue_name,
            venue_id: validatedData.venue_id,
            deal_type: validatedData.deal_type,
            website_url: validatedData.website_url || null,
            image_url: validatedData.image_url || null,
            starts_at: data.starts_at,
            expires_at: data.expires_at,
            active: data.active,
          })
          .eq("id", deal.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("deals").insert([
          {
            title: validatedData.title,
            description: validatedData.description,
            venue_name: validatedData.venue_name,
            venue_id: validatedData.venue_id,
            deal_type: validatedData.deal_type,
            website_url: validatedData.website_url || null,
            image_url: validatedData.image_url || null,
            starts_at: data.starts_at,
            expires_at: data.expires_at,
            active: data.active,
          },
        ]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(deal ? "Deal updated" : "Deal created");
      onSuccess();
    },
    onError: (error) => {
      toast.error("Failed to save deal");
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
        <CardTitle>{deal ? "Edit Deal" : "Create Deal"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              maxLength={200}
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
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="venue_name">Venue Name</Label>
              <Input
                id="venue_name"
                value={formData.venue_name}
                onChange={(e) =>
                  setFormData({ ...formData, venue_name: e.target.value })
                }
                maxLength={200}
                required
              />
            </div>

            <div>
              <Label htmlFor="venue_id">Venue ID</Label>
              <Input
                id="venue_id"
                value={formData.venue_id}
                onChange={(e) =>
                  setFormData({ ...formData, venue_id: e.target.value })
                }
                maxLength={200}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="deal_type">Deal Type</Label>
            <Input
              id="deal_type"
              value={formData.deal_type}
              onChange={(e) =>
                setFormData({ ...formData, deal_type: e.target.value })
              }
              maxLength={100}
              placeholder="e.g., Food, Drinks, Events"
              required
            />
          </div>

          <div>
            <Label htmlFor="website_url">Website URL</Label>
            <Input
              id="website_url"
              type="url"
              value={formData.website_url}
              onChange={(e) =>
                setFormData({ ...formData, website_url: e.target.value })
              }
            />
          </div>

          <div>
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              type="url"
              value={formData.image_url}
              onChange={(e) =>
                setFormData({ ...formData, image_url: e.target.value })
              }
            />
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
