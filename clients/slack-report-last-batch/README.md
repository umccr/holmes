An interim step to run batch reports of the fingerprinter.
This examines the fingerprint bucket and finds the last day on which
new fingerprints were made. It then compares all of the fingerprints
from that day with the entire UMCCR cohort.

Currently invokable by prod admin

`npm run prod`

Will output a report to Slack #biobots.

Whilst most of this code will probably end up somewhere - it shouldn't live
in this format (as a CLI tool for prod). Will be better triggered
via crons etc. Maybe convert this whole script to a Steps function
within Holmes itself - and invoke daily.
