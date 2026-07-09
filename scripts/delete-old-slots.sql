-- Delete all old slot games from the games table
-- This removes slot-themed games that are no longer needed
DELETE FROM games 
WHERE slug IN (
  'sweet-bonanza',
  'gates-of-olympus',
  'book-of-ra',
  'starburst',
  'gonzo-quest',
  'big-bass-bonanza',
  'reactoonz',
  'temple-tumble',
  'pragmatic-play-demo',
  'hacksaw-demo'
) OR slug LIKE '%slot%' OR slug LIKE '%pragmatic%' OR slug LIKE '%hacksaw%';
