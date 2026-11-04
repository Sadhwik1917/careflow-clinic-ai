import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FutureAnalyticsCard } from "@/components/careflow/future-analytics-card";
import { FUTURE_DATA_UNAVAILABLE_MESSAGE, type FutureVisualizationDef } from "@/lib/analytics-types";

describe("future analytics visualization card", () => {
  const sampleDef: FutureVisualizationDef = {
    id: "sample-predictive-insight",
    title: "Patient No-Show Risk Predictor",
    description: "Evaluates machine learning probability of missed appointments.",
    purpose: "Enables receptionists to proactively send targeted SMS/WhatsApp reminders.",
    dataRequired: ["appointments (history)", "notifications (delivery telemetry)"],
    aggregation: "Random forest probability classifier mapped to risk buckets",
    role: "OWNER",
    status: "PLANNED",
    chartType: "scatter",
  };

  it("renders the exact consistent unavailable-data wording naturally", () => {
    render(<FutureAnalyticsCard definition={sampleDef} />);

    // Exact required wording: "Data isn’t available yet. This insight may become available in a future update."
    expect(screen.getByText(FUTURE_DATA_UNAVAILABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(sampleDef.title)).toBeInTheDocument();
    expect(screen.getByText(sampleDef.description)).toBeInTheDocument();
  });

  it("displays Planned Insight badge and never fabricates mock numbers or fake trends", () => {
    const { container } = render(<FutureAnalyticsCard definition={sampleDef} />);

    expect(screen.getByText("Planned Insight")).toBeInTheDocument();

    // Verify there are NO fake numbers or sample metrics rendered in the card content
    const text = container.textContent || "";
    expect(text).not.toContain("98.5%");
    expect(text).not.toContain("₹");
    expect(text).not.toContain("Dummy");
    expect(text).not.toContain("Sample Data");
  });

  it("expands data connection spec to show required database fields and aggregation", () => {
    render(<FutureAnalyticsCard definition={sampleDef} />);

    const toggleBtn = screen.getByRole("button", { name: /Future Data Connection Spec/i });
    expect(screen.queryByText(/Required data sources:/i)).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Required data sources:/i)).toBeInTheDocument();
    expect(screen.getByText("appointments (history)")).toBeInTheDocument();
    expect(screen.getByText("notifications (delivery telemetry)")).toBeInTheDocument();
    expect(screen.getByText(sampleDef.aggregation)).toBeInTheDocument();
  });
});
