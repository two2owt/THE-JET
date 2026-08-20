-- idempotency-check: allow-dml
UPDATE public.profiles p SET
  bio = COALESCE(v.bio, p.bio),
  birthdate = COALESCE(v.birthdate, p.birthdate),
  gender = COALESCE(v.gender, p.gender),
  pronouns = COALESCE(v.pronouns, p.pronouns),
  instagram_url = COALESCE(v.instagram_url, p.instagram_url),
  tiktok_url = COALESCE(v.tiktok_url, p.tiktok_url)
FROM (VALUES
  ('94acd2bb-bf58-48e6-b2c3-4f684609ab77'::uuid, 'Where we meeting for happy hour? 🍸', NULL::date, 'woman', 'she/her', NULL::text, NULL::text),
  ('7ab8e126-641c-4edb-8665-edc84516c2c0'::uuid, 'Jiggy Nigga', '1996-03-09'::date, 'man', 'he/him', NULL, NULL),
  ('7f05e65d-05f7-4f96-98e5-35b940d2fe99'::uuid, NULL, '1991-09-09'::date, 'woman', 'she/her', NULL, NULL),
  ('54004bc6-16ba-4f90-9ff9-7661ac5b6f5b'::uuid, 'D', '1990-01-19'::date, 'man', 'he/him', NULL, NULL),
  ('677734a2-b20b-475b-b791-32c07c55e5e9'::uuid, 'Hello, world! 🌿 I’m truly happy to be a part of this wonderful community and wanted to take a moment to introduce myself. I believe there’s something special about living in a town where people look out for one another, share recommendations, and help build a welcoming environment. I’m looking forward to getting to know everyone, discovering local favorites, supporting small businesses, and becoming more involved in the community.', NULL, 'woman', 'she/her', 'https://www.instagram.com/livlifdaybyday?igsh=MWJkdGJoMGYzZzV3eA%3D%3D&utm_source=qr', 'https://www.tiktok.com/@kocopola25?_r=1&_t=ZT-98FHePP6fVd'),
  ('f8a4dac3-49d6-40f7-a198-44adecb8e37e'::uuid, NULL, NULL, 'woman', 'she/her', NULL, NULL)
) AS v(id, bio, birthdate, gender, pronouns, instagram_url, tiktok_url)
WHERE p.id = v.id;