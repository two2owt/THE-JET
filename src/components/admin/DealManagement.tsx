import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DealForm } from "./DealForm";
import { OnboardingStatusBadge } from "./OnboardingStatusBadge";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database['public']['Tables']['deals']['Row'];

export const DealManagement = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const queryClient = useQueryClient();

  const { data: deals, isLoading } = useQuery({
    queryKey: ['admin-deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (dealId: string) => {
      const { error } = await supabase
        .from('deals')
        .delete()
        .eq('id', dealId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-deals'] });
      toast.success('Deal deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete deal');
      console.error('Delete error:', error);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isCreating || editingDeal) {
    return (
      <DealForm
        deal={editingDeal}
        onClose={() => {
          setIsCreating(false);
          setEditingDeal(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-deals'] });
          setIsCreating(false);
          setEditingDeal(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Deals</h2>
          <p className="text-muted-foreground">Manage platform deals</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Deal
        </Button>
      </div>

      <div className="grid gap-4">
        {deals?.map((deal) => (
          <Card key={deal.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{deal.title}</CardTitle>
                  <CardDescription>{deal.venue_name}</CardDescription>
                  <div className="mt-2">
                    <OnboardingStatusBadge
                      startedAt={deal.onboarding_started_at}
                      completedAt={deal.onboarding_completed_at}
                      merchantId={deal.merchant_id}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingDeal(deal)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteMutation.mutate(deal.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{deal.description}</p>
              <div className="mt-2 text-sm">
                <span className="font-medium">Type:</span> {deal.deal_type}
              </div>
              <div className="mt-1 text-sm">
                <span className="font-medium">Status:</span>{' '}
                <span className={deal.active ? 'text-green-600' : 'text-red-600'}>
                  {deal.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {deals?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No deals yet. Create your first deal!
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
