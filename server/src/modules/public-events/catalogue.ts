import type { PipelineStage } from 'mongoose';
import { Event } from '../../models/event.model.js';
import { ExternalEvent } from '../../models/external-event.model.js';
import { Venue } from '../../models/venue.model.js';
import { AppError } from '../../errors/app-error.js';

const sourceRules = [
  { name: 'Ticketwala', url: /^https:\/\/(?:www\.)?ticketwala\.(?:pk|events)\/event\/[a-zA-Z0-9_~%./-]+(?:\?[^\s#]*)?$/ },
  { name: 'AllEvents', url: /^https:\/\/(?:www\.)?allevents\.in\/(?:islamabad\/[^\s?#]+\/|event\/)\d+\/?(?:\?[^\s#]*)?$/ },
  { name: 'Shapargullay', url: /^https:\/\/(?:www\.)?shapargullay\.com\/events\/[a-zA-Z0-9_-]+\/?$/ },
  { name: 'Bookme', url: /^https:\/\/(?:www\.)?bookme\.pk\/events\/[a-zA-Z0-9_-]+\/?$/ },
  { name: 'Media Sniffers', url: /^https:\/\/(?:www\.)?mediasniffers\.pk\/upcoming-music-events-in-pakistan-2026-organized-by-media-sniffers\/?$/ },
];
export function visibleExternalEvents(now: Date): Record<string, unknown> {
  return { status: 'published', startAt: { $type: 'date' }, $or: sourceRules.map((rule) => ({ sources: { $elemMatch: rule } })),
    $expr: { $gte: [{ $cond: [{ $eq: ['$datePrecision', 'date'] }, { $add: ['$startAt', 86400000] }, '$startAt'] }, now] } };
}
function pageNumber(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new AppError(422, 'VALIDATION_ERROR', `Pagination must be a whole number between 1 and ${max}.`);
  }
  return Number(value);
}

export async function combinedCatalogue(query: Record<string, unknown>, ownFilter: Record<string, unknown>,
  options: { q: string | undefined; category: string | undefined; city: string | undefined; from: Date | undefined; to: Date | undefined }) {
  const kind = query.kind ?? 'all';
  if (!['all', 'external', 'seatlock'].includes(kind as string)) throw new AppError(422, 'VALIDATION_ERROR', 'Kind must be all, external, or seatlock.');
  const page = pageNumber(query.page, 1, 1000);
  const limit = pageNumber(query.limit, 12, 100);
  const now = new Date();
  const externalFilter: Record<string, unknown> = visibleExternalEvents(now);
  if (options.from || options.to) externalFilter.startAt = {
    $type: 'date', ...(options.from ? { $gte: options.from } : {}), ...(options.to ? { $lte: options.to } : {}),
  };
  for (const [field, value] of Object.entries({ title: options.q, city: options.city })) {
    if (value) externalFilter[field] = { $regex: new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
  }
  if (options.category) {
    const regex = new RegExp(options.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    externalFilter.$and = [{ $or: [{ category: regex }, { categories: regex }] }];
  }
  const externalPipeline: Array<PipelineStage.Match | PipelineStage.Project> = [
    { $match: externalFilter },
    { $project: {
      _id: 0, id: { $toString: '$_id' }, kind: { $literal: 'external' }, title: 1, category: 1,
      posterUrl: 1, startsAt: '$startAt', datePrecision: 1, timezone: 1,
      priceFrom: '$price', currency: 1, venue: { name: '$venue', address: '$city' },
      sources: { $filter: { input: '$sources', as: 'source', cond: { $or: sourceRules.map((rule) => ({ $and: [
        { $eq: ['$$source.name', rule.name] }, { $regexMatch: { input: { $ifNull: ['$$source.url', ''] }, regex: rule.url } },
      ] })) } } }, lastCheckedAt: 1,
    } },
  ];
  const ownPipeline: PipelineStage[] = [
    { $match: ownFilter },
    { $lookup: { from: Venue.collection.name, localField: 'venueId', foreignField: '_id', as: 'venue' } },
    { $unwind: '$venue' },
    { $project: { _id: 0, id: { $toString: '$_id' }, kind: { $literal: 'seatlock' }, slug: { $cond: [{ $in: [{ $ifNull: ['$slug', ''] }, ['']] }, { $toString: '$_id' }, '$slug'] }, title: 1, category: 1,
      posterUrl: '$imageUrl', startsAt: 1, timezone: 1, currency: 1, priceFrom: { $min: '$sectionPrices.amount' },
      venue: { name: '$venue.name', address: '$venue.address' },
    } },
  ];
  const pipeline: PipelineStage[] = kind === 'external' ? externalPipeline : ownPipeline;
  if (kind === 'all') pipeline.push({ $unionWith: { coll: ExternalEvent.collection.name, pipeline: externalPipeline } });
  pipeline.push({ $sort: { startsAt: 1, kind: 1, id: 1 } }, { $facet: {
    events: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }],
  } });
  const [result] = await (kind === 'external' ? ExternalEvent : Event).aggregate(pipeline);
  const total = result?.count[0]?.total ?? 0;
  return { events: result?.events ?? [], pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
