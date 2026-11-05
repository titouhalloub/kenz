-- Stable global category IDs shared by offline defaults and signed-in cloud profiles.
INSERT INTO public.categories (id, user_id, name, icon, color, is_income, is_system)
VALUES
('00000000-0000-4000-8000-000000000001'::uuid,NULL,'Alimentation & Marché','ShoppingBag','#10b981',false,TRUE),
('00000000-0000-4000-8000-000000000002'::uuid,NULL,'Loyer & Logement','Home','#f59e0b',false,TRUE),
('00000000-0000-4000-8000-000000000003'::uuid,NULL,'Factures (Sonelgaz, Eau, Net)','Zap','#ef4444',false,TRUE),
('00000000-0000-4000-8000-000000000004'::uuid,NULL,'Transport & Carburant','Car','#3b82f6',false,TRUE),
('00000000-0000-4000-8000-000000000005'::uuid,NULL,'Santé & Pharmacie','Heart','#ec4899',false,TRUE),
('00000000-0000-4000-8000-000000000006'::uuid,NULL,'Famille & Enfants','Users','#8b5cf6',false,TRUE),
('00000000-0000-4000-8000-000000000007'::uuid,NULL,'Salaire / Revenu Principal','Briefcase','#10b981',true,TRUE),
('00000000-0000-4000-8000-000000000008'::uuid,NULL,'Revenu Complémentaire','TrendingUp','#06b6d4',true,TRUE)
ON CONFLICT (id) DO UPDATE SET
  user_id = NULL,
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  is_income = EXCLUDED.is_income,
  is_system = TRUE;
