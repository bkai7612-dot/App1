-- Supported games and platforms. Platform integration_status is deliberately honest:
--   verified_linking = ownership verification via an official, documented mechanism is implemented
--   manual           = manual identification; ownership claims are reviewed by moderators
--   future           = reserved integration point; NOT operational
SET search_path = ss, public;

INSERT INTO ss.games (slug, name, sort_order) VALUES
  ('rainbow-six-siege', 'Rainbow Six Siege', 10),
  ('league-of-legends', 'League of Legends', 20),
  ('call-of-duty', 'Call of Duty', 30),
  ('counter-strike-2', 'Counter-Strike 2', 40),
  ('valorant', 'Valorant', 50),
  ('minecraft', 'Minecraft', 60),
  ('rust', 'Rust', 70),
  ('other', 'Other', 1000)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO ss.platforms (slug, name, integration_status, identifier_label, sort_order) VALUES
  ('ubisoft-connect', 'Ubisoft Connect', 'manual', 'Ubisoft username', 10),
  ('steam', 'Steam', 'verified_linking', 'Steam profile name', 20),
  ('riot-games', 'Riot Games', 'manual', 'Riot ID (name#tag)', 30),
  ('xbox', 'Xbox', 'manual', 'Gamertag', 40),
  ('playstation-network', 'PlayStation Network', 'manual', 'PSN Online ID', 50),
  ('other', 'Other', 'manual', 'Username', 1000)
ON CONFLICT (slug) DO NOTHING;
