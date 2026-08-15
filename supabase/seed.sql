-- Optional: one test puzzle so the app has something to render immediately
-- after the schema is created. Pulled from the old local dev fallback
-- (src/assets/data.json). Run in the Supabase SQL editor, then add real
-- puzzles for other dates via the Table Editor (paste JSON into `content`)
-- or additional inserts like this one.

insert into games (game_date, content, source) values (
  current_date,
  '{"green":{"category_name":"States with Highest IQ (Top 10)","items":["Massachusetts","New Hampshire","North Dakota","Vermont","Minnesota","Maine","Montana","Iowa","Connecticut","Wisconsin","x","x","x"]},"red":{"category_name":"States with National Parks","items":["Alaska","American Samoa","Arizona","Arkansas","California","Colorado","Florida","Hawaii","Idaho","Indiana","Kentucky","Maine","Michigan","Minnesota","Missouri","Montana","Nebraska","Nevada","New Mexico","North Carolina","North Dakota","Ohio","Oregon","South Carolina","South Dakota","Tennessee","Texas","Utah","Virginia","Washington","West Virginia","Wyoming","x","x","x"]},"yellow":{"category_name":"Blue States in 2024 Election","items":["California","Colorado","Connecticut","Delaware","Hawaii","Illinois","Maine","Maryland","Massachusetts","Michigan","Minnesota","Nevada","New Hampshire","New Jersey","New Mexico","New York","Oregon","Pennsylvania","Rhode Island","Vermont","Virginia","Washington","Wisconsin","x","x","x"]},"blue":{"category_name":"States Originally Owned by Spain","items":["Arizona","California","Colorado","Florida","Louisiana","Nevada","New Mexico","Texas","Utah","Wyoming","Idaho","Oregon","Montana","x","x","x"]}}'::jsonb,
  'seed'
);
