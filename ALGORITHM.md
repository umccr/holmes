# Algorithm

Whilst somalier is responsible for telling us the similarity between
each file - we need to come up with an algorithm for what to do with that
information.

## (Un)Expected Related and Unexpected Unrelated

Index files are compared to every fingerprint in the database (including themselves).
For each comparison `somalier` returns a variety of statistics - in
particular `N` (the count of site matches) and `relatedness` (a score of similarity at those sites, with
one meaning identical).

Index file names are also compared to the filename of every fingerprint in the database - using
a regular expression. If every capture group of the regular expression matches between the
file names then we return a `regexMatch` of true, else false (for example, we can set a regex
to match of the `SUBJ_xxxx` part of the filename).

```text
if (regexMatch and relatedness < threshold)
   return Unexpected Unrelated { relatedness }
else {
    if (relatedness >= threshold and N > minimum N) {
       # passing these thresholds means
       # we believe these refer to the same sample with a degree of confidence
       if (regexMatch)
            # we may not report out Expected Related
            # but it is useful to return the value of relation
            return Expected Related { relatedness }
       else
            return Unexpected Related { relatedness }
    }
}
```
