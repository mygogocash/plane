/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, type FieldPath, useFormContext } from "react-hook-form";
// plane imports
import type { TIssue, TIssueProperty, TIssuePropertyOption, TIssuePropertyValue } from "@plane/types";
// helpers
import { isSelfHostedFeatureEnabled } from "@/plane-web/lib/self-host-entitlements";
// hooks
import { useIssueProperty } from "@/hooks/store/use-issue-property";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
};

const getDefaultPropertyValue = (property: TIssueProperty): TIssuePropertyValue => {
  if (property.default_value !== null && property.default_value !== undefined) return property.default_value;
  if (property.property_type === "multi_select") return [];
  if (property.property_type === "boolean") return false;
  return "";
};

const getPropertyOptions = (property: TIssueProperty): TIssuePropertyOption[] => property.settings?.options ?? [];

const getFieldName = (propertyId: string): FieldPath<TIssue> => `property_values.${propertyId}` as FieldPath<TIssue>;

const EMPTY_PROPERTIES: TIssueProperty[] = [];

export const WorkItemModalAdditionalProperties = observer(function WorkItemModalAdditionalProperties(
  props: TWorkItemModalAdditionalPropertiesProps
) {
  const { workspaceSlug } = props;
  const featureEnabled = isSelfHostedFeatureEnabled("work_item_types");
  const { control, setValue, watch } = useFormContext<TIssue>();
  const { fetchPropertiesForType, getPropertiesForType, getPropertiesLoadingForType, hasFetchedPropertiesForType } =
    useIssueProperty();

  const selectedIssueTypeId = watch("type_id");
  const properties = selectedIssueTypeId ? getPropertiesForType(selectedIssueTypeId) : EMPTY_PROPERTIES;
  const isLoading = selectedIssueTypeId ? getPropertiesLoadingForType(selectedIssueTypeId) : false;
  const hasFetched = selectedIssueTypeId ? hasFetchedPropertiesForType(selectedIssueTypeId) : false;

  useEffect(() => {
    if (!featureEnabled || !workspaceSlug || !selectedIssueTypeId || isLoading || hasFetched) return;
    void fetchPropertiesForType(workspaceSlug, selectedIssueTypeId);
  }, [featureEnabled, fetchPropertiesForType, hasFetched, isLoading, selectedIssueTypeId, workspaceSlug]);

  useEffect(() => {
    if (!selectedIssueTypeId || !hasFetched) return;
    const activePropertyIds = new Set(properties.map((property) => property.id));
    const propertyValues = watch("property_values") ?? {};
    const nextValues = Object.fromEntries(
      Object.entries(propertyValues).filter(([propertyId]) => activePropertyIds.has(propertyId))
    );

    if (Object.keys(propertyValues).length !== Object.keys(nextValues).length)
      setValue("property_values", nextValues, { shouldDirty: true });
  }, [hasFetched, properties, selectedIssueTypeId, setValue, watch]);

  if (!featureEnabled || !selectedIssueTypeId || properties.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {properties.map((property) => (
        <Controller
          key={property.id}
          control={control}
          name={getFieldName(property.id)}
          defaultValue={getDefaultPropertyValue(property)}
          render={({ field }) => {
            const commonClassName =
              "h-7 min-w-32 rounded border border-custom-border-200 bg-custom-background-100 px-2 text-12 text-custom-text-200 outline-none focus:border-custom-primary-100";

            return (
              <label className="text-custom-text-300 flex items-center gap-1 text-12">
                <span>{property.display_name}</span>
                {property.property_type === "select" && (
                  <select
                    {...field}
                    value={(field.value as string | null | undefined) ?? ""}
                    required={property.is_required}
                    aria-label={property.display_name}
                    className={commonClassName}
                  >
                    <option value="" />
                    {getPropertyOptions(property).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                {property.property_type === "multi_select" && (
                  <select
                    {...field}
                    value={(field.value as string[] | undefined) ?? []}
                    multiple
                    required={property.is_required}
                    aria-label={property.display_name}
                    className={`${commonClassName} h-16`}
                    onChange={(event) => {
                      field.onChange(Array.from(event.target.selectedOptions).map((option) => option.value));
                    }}
                  >
                    {getPropertyOptions(property).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
                {property.property_type === "boolean" && (
                  <input
                    name={field.name}
                    ref={field.ref}
                    type="checkbox"
                    checked={Boolean(field.value)}
                    required={property.is_required}
                    aria-label={property.display_name}
                    className="border-custom-border-200 text-custom-primary-100 h-4 w-4 rounded"
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(event.target.checked)}
                  />
                )}
                {property.property_type !== "select" &&
                  property.property_type !== "multi_select" &&
                  property.property_type !== "boolean" && (
                    <input
                      {...field}
                      type={
                        property.property_type === "number"
                          ? "number"
                          : property.property_type === "date"
                            ? "date"
                            : property.property_type === "url"
                              ? "url"
                              : "text"
                      }
                      value={(field.value as string | number | null | undefined) ?? ""}
                      required={property.is_required}
                      aria-label={property.display_name}
                      className={commonClassName}
                      onChange={(event) => {
                        if (property.property_type === "number")
                          return field.onChange(event.target.value === "" ? null : Number(event.target.value));
                        return field.onChange(event.target.value);
                      }}
                    />
                  )}
              </label>
            );
          }}
        />
      ))}
    </div>
  );
});
