import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NeighborhoodForm } from "./NeighborhoodForm";
import type { Database } from "@/integrations/supabase/types";

type Neighborhood = Database["public"]["Tables"]["neighborhoods"]["Row"];

export const NeighborhoodManagement = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingNeighborhood, setEditingNeighborhood] =
    useState<Neighborhood | null>(null);
  const queryClient = useQueryClient();

  const { data: neighborhoods, isLoading } = useQuery({
    queryKey: ["admin-neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("neighborhoods")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (neighborhoodId: string) => {
      const { error } = await supabase
        .from("neighborhoods")
        .delete()
        .eq("id", neighborhoodId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-neighborhoods"] });
      toast.success("Neighborhood deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete neighborhood");
      console.error("Delete error:", error);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isCreating || editingNeighborhood) {
    return (
      <NeighborhoodForm
        neighborhood={editingNeighborhood}
        onClose={() => {
          setIsCreating(false);
          setEditingNeighborhood(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["admin-neighborhoods"] });
          setIsCreating(false);
          setEditingNeighborhood(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Neighborhoods</h2>
          <p className="text-muted-foreground">Manage platform neighborhoods</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Neighborhood
        </Button>
      </div>

      <div className="grid gap-4">
        {neighborhoods?.map((neighborhood) => (
          <Card key={neighborhood.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{neighborhood.name}</CardTitle>
                  <CardDescription>{neighborhood.slug}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingNeighborhood(neighborhood)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate(neighborhood.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {neighborhood.description}
              </p>
              <div className="mt-2 text-sm">
                <span className="font-medium">Center:</span>{" "}
                {Number(neighborhood.center_lat).toFixed(4)},{" "}
                {Number(neighborhood.center_lng).toFixed(4)}
              </div>
              <div className="mt-1 text-sm">
                <span className="font-medium">Status:</span>{" "}
                <span
                  className={
                    neighborhood.active ? "text-green-600" : "text-red-600"
                  }
                >
                  {neighborhood.active ? "Active" : "Inactive"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}

        {neighborhoods?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No neighborhoods yet. Create your first neighborhood!
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
