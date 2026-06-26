import { AlertTriangle } from "lucide-react";
import { formatSubscriptionDate, getSubscriptionStatus } from "../lib/subscriptionUtils.js";

export default function SubscriptionExpiryBanner({ subscription, departmentName = "" }) {
  const status = getSubscriptionStatus(subscription);
  if (!status?.show) return null;

  const branchLabel = departmentName ? `${departmentName} — ` : "";

  return (
    <div className={`subscription-expiry-banner subscription-expiry-banner-${status.level}`}>
      <div className="subscription-expiry-banner-copy">
        <AlertTriangle size={16} />
        <div>
          <strong>{branchLabel}{status.title}</strong>
          <span>{status.message}</span>
          {status.startDate ? (
            <span className="subscription-expiry-banner-meta">
              Term: {formatSubscriptionDate(status.startDate)} → {formatSubscriptionDate(status.expirationDate)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
