export const MAX_RELATE = 25;

// the limits are mainly designed to avoid overflow of the steps state machines
// the use of distributed maps solves that in some sense - but we have to be
// careful that no individual invoke of a lambda returns results into the
// state that is > 256kb
// the result of "check" grows roughly linearly with the number of samples
// in the check. At max check 50 - the result was 56kb. We have now set it
// to 100 for a trial.
export const MAX_CHECK = 100;
