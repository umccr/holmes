# Algorithm

Whilst somalier is responsible for telling us the similarity between
each file - we need to come up with an algorithm for what to do with that
information.

## (Un)Expected Related and Unexpected Unrelated

Index files (the index fingerprints are those that we are asking to be "checked")
are compared to every fingerprint in the database (including themselves).
For each comparison `somalier` returns a variety of statistics - in
particular `N` (the count of site matches) and `relatedness` (a score of similarity at those sites, with
one meaning identical).

Each fingerprint when created is supplied with a subject identifier. These subject identifiers
are compared to every fingerprint in the database - and where they match then
`subjectMatch` is set to true.

```text
if (regexMatch and relatedness < threshold)
   return Unexpected Unrelated { relatedness }
else {
    if (relatedness >= threshold and N > minimum N) {
       # passing these thresholds means
       # we believe these refer to the same sample with a degree of confidence
       if (subjectMatch)
            # we may not report out Expected Related
            # but it is useful to return the value of relation
            return Expected Related { relatedness }
       else
            return Unexpected Related { relatedness }
    }
}
```
