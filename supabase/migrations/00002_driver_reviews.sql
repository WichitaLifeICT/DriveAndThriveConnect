-- Driver Reviews table
CREATE TABLE public.driver_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_request_id UUID NOT NULL REFERENCES public.ride_requests(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_review_per_ride UNIQUE (ride_request_id, reviewer_id)
);

CREATE INDEX idx_driver_reviews_driver ON public.driver_reviews(driver_id);
CREATE INDEX idx_driver_reviews_ride ON public.driver_reviews(ride_request_id);

-- RLS
ALTER TABLE public.driver_reviews ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reviews (public trust signal)
CREATE POLICY "Anyone can view reviews"
  ON public.driver_reviews FOR SELECT
  TO authenticated
  USING (true);

-- Only the reviewer can insert their own review
CREATE POLICY "Reviewer can insert own review"
  ON public.driver_reviews FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = reviewer_id);
