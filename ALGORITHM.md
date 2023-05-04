# Algorithm

Whilst somalier is responsible for telling us the similarity between
each file - we need to come up with an algorithm for what to do with that
information.

## Unexpected Related and Unexpected Unrelated

Index files are compared to every fingerprint in the database (including themselves).
For each comparison `somalier` returns a variety of statistics - in
particular `N` (the count of site matches) and `relatedness` (a score of similarity at those sites, with
one meaning identical).

Index file names are also compared to the filename of every fingerprint in the database - using
a regular expression. If every capture group of the regular expression matches between the
file names then we return a `regexMatch` of true, else false.

```text
if (relatedness > threshold and N > threshold)
   - we
```
