import type { RoundReview } from '../lib/roundReview.ts';

type FiveRoundReviewProps = {
  reviews: RoundReview[];
  totalRounds?: 4 | 5;
  saving: boolean;
  onSave: () => void;
};

export function FiveRoundReview({ reviews, totalRounds = 5, saving, onSave }: FiveRoundReviewProps) {
  return (
    <section aria-labelledby="five-round-review-title" className="five-round-review">
      <div className="five-round-review__heading">
        <div>
          <p className="page-kicker">Your journey</p>
          <h3 id="five-round-review-title">The {totalRounds === 5 ? 'five' : 'four'} places</h3>
        </div>
        <span>01 — {String(totalRounds).padStart(2, '0')}</span>
      </div>
      <ol className="five-round-review__list">
        {reviews.map((review) => (
          <li className="five-round-review__row" key={review.round}>
            <div className="five-round-review__photo">
              <img alt={`Round ${review.round} photograph`} src={review.photoUrl} />
            </div>
            <div className="five-round-review__places">
              <span>Round {String(review.round).padStart(2, '0')}</span>
              <p><small>Your answer</small><strong>{review.locationPending ? 'Finding nearby city…' : review.guessLabel}</strong><em>{review.guessPosition}</em></p>
              <p><small>Correct answer</small><strong>{review.answerLabel}</strong></p>
            </div>
            <div className="five-round-review__score">
              <strong>+{review.score.toLocaleString()}</strong>
              <span>pts</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="five-round-review__actions">
        <p>Contains answers — share after friends play.</p>
        <button disabled={saving || reviews.length !== totalRounds || reviews.some((review) => review.locationPending)} onClick={onSave} type="button">
          {saving ? 'Saving…' : reviews.some((review) => review.locationPending) ? 'Finding place names…' : 'Save review image'}
        </button>
      </div>
    </section>
  );
}
