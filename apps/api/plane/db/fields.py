# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from plane.license.utils.encryption import decrypt_data, encrypt_data


class SecretField(models.TextField):
    """A TextField whose value is encrypted at rest.

    The database column stores Fernet-encrypted ciphertext, never plaintext.
    The Python attribute round-trips back to plaintext via ``from_db_value``.
    Encryption is intentionally limited to the write path so lookups against
    the encrypted column are never attempted (Fernet ciphertext is
    non-deterministic and cannot be matched by equality).
    """

    def from_db_value(self, value, expression, connection):
        if value is None or value == "":
            return value
        return decrypt_data(value)

    def get_db_prep_save(self, value, connection):
        if value is None or value == "":
            return value
        return encrypt_data(str(value))
